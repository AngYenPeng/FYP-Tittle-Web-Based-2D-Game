/**
 * CrystalNpc — 水晶族 NPC
 *
 * 参考 MoleTrader / Hint 实现, 给 SZ2/SZ3 复用:
 * - 蓝水晶色 sprite (没贴图就 fallback 矩形)
 * - 靠近 → "E" 漂浮图标
 * - 按 E → 调用 onInteract 回调 (调用方负责对话/状态)
 * - 对话开启时 DialogSystem.isOpen 自动锁玩家移动 (MovementSystem 已处理)
 *
 * 使用:
 *   new CrystalNpc(scene, col, row, {
 *       onInteract: (npc) => { ... 处理对话/任务 ... }
 *   });
 */
class CrystalNpc {
    constructor(scene, col, row, options = {}) {
        this.scene = scene;
        const G = 32;
        this.col = col;
        this.row = row;
        this.x = col * G + G / 2;
        this.y = row * G + G / 2 + (options.yOffset || 0);  // 可选 y 偏移 (SZ2 传 20)
        this._stickIcon = options.stickIcon || false;  // E 图标粘头上不漂浮
        this.interactRange = options.interactRange || ((typeof InteractSystem !== 'undefined' && InteractSystem.RANGE) || 80);   // (用户) 全游戏统一交互距离
        this.onInteract = options.onInteract || (() => {});
        this.texture = options.texture || null;
        this.tint = options.tint || 0x66ddff;

        this._isOpen = false;           // 节流 (防 E 长按重复触发)
        this._hintVisible = false;
        this._eIconTween = null;

        // 动画 profile (chief/scammer/smith/teen/twin); 没有则走静态贴图/矩形
        this._animProfile = (options.npcType && CrystalNpc.NPC_PROFILES[options.npcType])
            ? CrystalNpc.NPC_PROFILES[options.npcType] : null;
        this._curAnim = null;
        this._idleOverride = options.idleOverride || null;   // 覆盖 idle 动画 (如 Toy NPC 交玩具后切 happy)
        this._fearMode = false;
        this._lastAnimX = this.x;

        // 主 sprite — 优先动画, 其次静态 texture, 最后 fallback 蓝矩形
        if (this._animProfile && scene.textures.exists(this._animProfile.idle)) {
            CrystalNpc.registerAnims(scene);   // 懒注册 (幂等)
            this.sprite = scene.add.sprite(this.x, this.y, this._animProfile.idle).setDepth(10);
            // (用户) 行走声·自愈心跳 (100ms, 走 scene.time 与一切 update/事件路径解绑):
            //   每拍检测"当前动画是否 walk" → 起/收声 + 距离调音. 动画即真相源, 任何路径
            //   (巡逻/剧情手动 play/_cinematicMode) 一视同仁; 音频延迟加载迟到 → 下一拍自动接上
            //   (旧事件方案只在动画开始那一刻试一次, 音频没下完 = 永久哑火, 即 CNPC 无声根因).
            //   每个 NPC 独立音轨 — 双胞胎同走 = 两份叠加.
            {
                this._stepTick = scene.time.addEvent({ delay: 100, loop: true, callback: () => {
                    if (this.scene && this.scene._endingActive) { this._stepSound(false); return; }   // (用户) 结局总闸
                    const a = this.sprite && this.sprite.anims;
                    const animWalk = !!(this._animProfile.walk && a && a.isPlaying && a.currentAnim && a.currentAnim.key === this._animProfile.walk);
                    // (用户) 真相源双保险: walk 动画 OR 本拍实际位移 (>0.5px) — 剧情滑行/吓跑(fear动画)/
                    //   _cinematicMode 跳过 update 的一切场合, 只要在动就有脚步
                    const _lx = (this._tickLastX !== undefined) ? this._tickLastX : this.sprite.x;
                    this._tickLastX = this.sprite.x;
                    const moved = Math.abs(this.sprite.x - _lx) > 0.5;
                    this._stepSound(animWalk || moved);
                    if (this._stepSnd && typeof AudioSystem !== 'undefined' && AudioSystem._mobVol) {
                        this._stepSnd.setVolume(AudioSystem._mobVol(this.scene, this.sprite.x, this.sprite.y));
                    }
                }});
                scene.events.once('shutdown', () => {
                    if (this._stepTick) { try { this._stepTick.remove(); } catch (e) {} this._stepTick = null; }
                    this._stepSound(false);
                });
            }
            if (this._animProfile.facing === 'right') this.sprite.flipX = true;
        } else if (this.texture && scene.textures.exists(this.texture)) {
            this.sprite = scene.add.sprite(this.x, this.y, this.texture)
                .setDepth(10);
            if (this.tint && this.sprite.setTint) this.sprite.setTint(this.tint);
        } else {
            // fallback: 蓝色发光矩形 (略大一点, 像晶体雕像)
            this.sprite = scene.add.rectangle(this.x, this.y, 32, 48, this.tint, 1)
                .setStrokeStyle(2, 0x33aacc)
                .setDepth(10);
        }

        // 加物理 + 重力 — 水晶族受重力影响, 落地停在墙上 (调用方负责 add.collider walls)
        scene.physics.add.existing(this.sprite);
        if (this.sprite.body) {
            this.sprite.body.setAllowGravity(true);
            this.sprite.body.setGravityY(1500);
            this.sprite.body.setCollideWorldBounds(true);
            if (this._animProfile && this.sprite.play) {
                this._playAnim(this._idleOverride || this._animProfile.idle);   // 播 idle + 套用该动画 hitbox
            } else if (this.sprite.body.setSize) {
                this.sprite.body.setSize(28, 40);          // 静态/矩形默认 hitbox
            }
        }

        if (scene.uiCam) {
            try { scene.uiCam.ignore(this.sprite); } catch(e) {}
        }

        // E 漂浮图标 — 用 Trader_interection_icon (静态 E 图, 跟商人同款), 非 Hint 动画
        if (scene.textures.exists('Trader_interection_icon')) {
            this.eIcon = scene.add.image(this.x, this.y - 40, 'Trader_interection_icon')
                .setDepth(500).setScale(1.2);
        } else if (scene.textures.exists('Hint')) {
            // fallback: Hint spritesheet
            if (!scene.anims.exists('hint_bounce')) {
                scene.anims.create({
                    key: 'hint_bounce',
                    frames: scene.anims.generateFrameNumbers('Hint', { start: 0, end: 6 }),
                    frameRate: 10,
                    repeat: -1
                });
            }
            this.eIcon = scene.add.sprite(this.x, this.y - 40, 'Hint', 0)
                .setDepth(500);
            this.eIcon.play('hint_bounce');
        } else {
            this.eIcon = scene.add.text(this.x, this.y - 40, '[E]', {
                fontSize: '20px', color: '#ffff66', fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 4
            }).setOrigin(0.5).setDepth(500);
        }
        this.eIcon.setVisible(false);

        if (scene.uiCam) {
            try { scene.uiCam.ignore(this.eIcon); } catch(e) {}
        }

        if (!scene._crystalNpcs) scene._crystalNpcs = [];
        scene._crystalNpcs.push(this);
    }

    _showHint() {
        if (this._hintVisible) return;
        // 对话/转场期间不显示 E
        const s = this.scene;
        if (s._cinematicLock || (s.dialogSystem && s.dialogSystem.isOpen)) return;
        this._hintVisible = true;
        this.eIcon.setVisible(true);
        this.eIcon.y = this.y - 40;
        // stickIcon: 粘头上不漂浮; 否则上下浮动
        if (this._stickIcon) {
            this._eIconTween = null;
        } else {
            this._eIconTween = this.scene.tweens.add({
                targets: this.eIcon,
                y: '-=10', duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
            });
        }
    }

    _hideHint() {
        if (!this._hintVisible) return;
        this._hintVisible = false;
        this.eIcon.setVisible(false);
        if (this._eIconTween) {
            this.scene.tweens.killTweensOf(this.eIcon);
            this._eIconTween = null;
        }
    }

    update() {
        if (!this.scene.player || !this.scene.player.body) return;
        const s = this.scene;
        // sprite 被重力移动, 同步 this.x/y 给距离检测用
        if (this.sprite && this.sprite.body) {
            this.x = this.sprite.x;
            this.y = this.sprite.y;
        }
        this._updateAnimFacing();   // 动画切换 + 朝向 (有 anim profile 才生效)
        // eIcon 跟随 sprite 上方 40 px (yIcon 浮动 tween 在 _showHint 用 += 改 y, 这里别覆盖)
        if (this.eIcon && !this._hintVisible) {
            this.eIcon.x = this.x;
            this.eIcon.y = this.y - 40;
        } else if (this.eIcon && this._hintVisible) {
            // stickIcon: 粘头上 (x+y 都跟随); 否则 y 由 tween 控制只跟 x
            this.eIcon.x = this.x;
            if (this._stickIcon) this.eIcon.y = this.y - 40;
        }

        const inCinematic = s._cinematicLock || (s.dialogSystem && s.dialogSystem.isOpen);

        const dx = s.player.x - this.x;
        const dy = s.player.y - this.y;
        const inRange = (dx*dx + dy*dy) < this.interactRange * this.interactRange;

        if (inRange && !inCinematic) this._showHint();
        else this._hideHint();

        if (inRange && !inCinematic && !this._isOpen &&
            s.keyE && Phaser.Input.Keyboard.JustDown(s.keyE)) {
            this._isOpen = true;
            try { this.onInteract(this); }
            catch(e) { console.error('CrystalNpc.onInteract error:', e); }
            // 短暂节流, 不会让 E 长按一次开多个对话
            s.time.delayedCall(200, () => { this._isOpen = false; });
        }
    }

    /** (用户) 行走声开/关 — 动画事件驱动, 独立音轨; 起声音量按当前距离, 之后 update 实时刷新 */
    _stepSound(on) {
        if (on) {
            if (this._stepSnd) return;
            const sc = this.scene;
            if (!sc || !sc.sound || typeof AudioSystem === 'undefined' || !sc.cache.audio.exists('Walking')) return;
            const v = AudioSystem._mobVol ? AudioSystem._mobVol(sc, this.sprite.x, this.sprite.y) : AudioSystem.sfxVolume * 0.6;
            try {
                this._stepSnd = sc.sound.add('Walking', { loop: true, volume: v });
                this._stepSnd.play();
            } catch (e) { this._stepSnd = null; }
        } else if (this._stepSnd) {
            try { this._stepSnd.stop(); this._stepSnd.destroy(); } catch (e) {}
            this._stepSnd = null;
        }
    }

    // ── 动画 / 朝向 / 动态 hitbox ──────────────────────────
    _playAnim(key) {
        if (!key || !this.sprite || !this.sprite.play) return;
        if (this._curAnim === key) return;
        if (!this.scene.anims.exists(key)) return;
        this.sprite.play(key, true);
        this._curAnim = key;
        this._applyAnimHitbox(key);   // 每个动画套自己的 hitbox, 防穿模
    }

    _applyAnimHitbox(key) {
        const cat = CrystalNpc.ANIM_CATALOG[key];
        if (!cat || !cat.hitbox) return;
        const b = this.sprite && this.sprite.body;
        if (!b || !b.setSize) return;
        const hb = cat.hitbox;
        b.setSize(hb.w, hb.h);
        if (b.setOffset) b.setOffset(hb.ox, hb.oy);
    }

    // idle 朝玩家 / walk 朝移动方向 / Teen 恒朝右. 动画默认朝左 → flipX=true 朝右
    _updateAnimFacing() {
        const prof = this._animProfile;
        if (!prof || !this.sprite || !this.sprite.play) return;
        const p = this.scene.player;
        if (!p) return;

        if (prof.facing === 'right') {
            this.sprite.flipX = true;
            this._playAnim((this._fearMode && prof.fear) ? prof.fear : (this._idleOverride || prof.idle));
            this._lastAnimX = this.sprite.x;
            return;
        }

        // 恐惧模式: 恒用 fear 动画 + 朝玩家 (即使后退移动也保持这个表情)
        if (this._fearMode && prof.fear) {
            this.sprite.flipX = (p.x >= this.sprite.x);
            this._playAnim(prof.fear);
            this._lastAnimX = this.sprite.x;
            return;
        }

        const vx = this.sprite.x - this._lastAnimX;
        const moving = Math.abs(vx) > 0.4;
        if (moving && prof.walk) {
            this.sprite.flipX = (vx > 0);                 // 朝移动方向
            this._playAnim(prof.walk);
        } else {
            this.sprite.flipX = (p.x >= this.sprite.x);   // 朝玩家
            this._playAnim(this._idleOverride || prof.idle);
        }
        this._lastAnimX = this.sprite.x;
    }

    // 骗子专用: 进入/退出恐惧表情 (true=用 Scammer_fear 替代 idle)
    setFear(on) { this._fearMode = (on !== false); }

    destroy() {
        if (this._eIconTween) this.scene.tweens.killTweensOf(this.eIcon);
        if (this.eIcon && this.eIcon.destroy) this.eIcon.destroy();
        if (this.sprite && this.sprite.destroy) this.sprite.destroy();
        if (this.scene._crystalNpcs) {
            const i = this.scene._crystalNpcs.indexOf(this);
            if (i >= 0) this.scene._crystalNpcs.splice(i, 1);
        }
    }
}

// ===== 动画目录: key → spritesheet 信息 + 每动画 hitbox =====
// 所有 spritesheet 默认朝左 (flipX=false 朝左, flipX=true 朝右), frameHeight=64
// hitbox {w,h,ox,oy}: 身体尺寸 + 相对帧左上角偏移 (底部对齐, 防穿模; 你可按实际贴图微调)
CrystalNpc.ANIM_CATALOG = {
    'Chief_idle':   { frames: 8, fw: 64, fh: 64, fps: 8,  hitbox: { w: 30, h: 50, ox: 17, oy: 14 } },
    'Chief_walk':   { frames: 6, fw: 64, fh: 64, fps: 10, hitbox: { w: 28, h: 50, ox: 18, oy: 14 } },
    'Scammer_fear': { frames: 4, fw: 64, fh: 64, fps: 8,  hitbox: { w: 30, h: 50, ox: 17, oy: 14 } },
    'Scammer_idle': { frames: 6, fw: 64, fh: 64, fps: 8,  hitbox: { w: 30, h: 50, ox: 17, oy: 14 } },
    'Scammer_walk': { frames: 6, fw: 64, fh: 64, fps: 10, hitbox: { w: 28, h: 50, ox: 18, oy: 14 } },
    'Smith_idle':   { frames: 6, fw: 64, fh: 64, fps: 8,  hitbox: { w: 30, h: 50, ox: 17, oy: 14 } },
    'Teen_idle':    { frames: 6, fw: 32, fh: 64, fps: 8,  hitbox: { w: 24, h: 50, ox: 4,  oy: 14 } },
    'Twin_idle':    { frames: 6, fw: 64, fh: 64, fps: 8,  hitbox: { w: 28, h: 50, ox: 18, oy: 14 } },
    'Twin_walk':    { frames: 6, fw: 64, fh: 64, fps: 10, hitbox: { w: 26, h: 50, ox: 19, oy: 14 } },
    // SZ3 丢玩具 NPC (cry → 交玩具后 happy) + keydoor 守门人
    'Crying_guy_cry':   { frames: 17, fw: 64, fh: 64, fps: 9, hitbox: { w: 30, h: 50, ox: 17, oy: 14 } },
    'Crying_guy_happy': { frames: 6,  fw: 64, fh: 64, fps: 8, hitbox: { w: 30, h: 50, ox: 17, oy: 14 } },
    'Gatekeeper_Idle':  { frames: 6,  fw: 64, fh: 64, fps: 6, hitbox: { w: 30, h: 50, ox: 17, oy: 14 } },
    'Tired_guy_sit':    { frames: 17, fw: 64, fh: 64, fps: 8, hitbox: { w: 36, h: 40, ox: 14, oy: 24 } },  // 坐姿: 矮(40)宽(36), 底部对齐 — 按实际贴图可微调
    'AutisticGuy_Sit':  { frames: 6,  fw: 64, fh: 64, fps: 8, hitbox: { w: 36, h: 40, ox: 14, oy: 24 } },  // (用户) SZ3 (-82,53) 独处坐姿 NPC 384×64 / 6 帧; 坐姿同款 hitbox, 可按贴图微调
};

// ===== NPC 类型 → 动画组合 + 朝向规则 =====
// facing: 'player' = idle/fear 朝玩家, walk 朝移动方向; 'right' = 恒朝右
CrystalNpc.NPC_PROFILES = {
    chief:   { idle: 'Chief_idle',   walk: 'Chief_walk',   facing: 'player' },
    scammer: { idle: 'Scammer_idle', walk: 'Scammer_walk', fear: 'Scammer_fear', facing: 'player' },
    smith:   { idle: 'Smith_idle',                         facing: 'player' },
    teen:    { idle: 'Teen_idle',                          facing: 'right'  },
    twin:    { idle: 'Twin_idle',    walk: 'Twin_walk',    facing: 'player' },
    crying_guy: { idle: 'Crying_guy_cry',  facing: 'player' },
    gatekeeper: { idle: 'Gatekeeper_Idle', facing: 'player' },
    tired_guy:  { idle: 'Tired_guy_sit',   facing: 'player' },
    autistic_guy: { idle: 'AutisticGuy_Sit', facing: 'right' },   // (用户) 想独处的坐姿 NPC — 恒朝右
};

// 在 preload 调用: 加载全部 CNPC spritesheet (缺图自动静默 → fallback 矩形)
CrystalNpc.loadAnimSheets = function (scene) {
    const cat = CrystalNpc.ANIM_CATALOG;
    for (const key in cat) {
        try {
            if (scene.textures.exists(key)) continue;
            scene.load.spritesheet(key, 'assets/images/' + key + '.png',
                { frameWidth: cat[key].fw, frameHeight: cat[key].fh });
        } catch (e) {}
    }
};

// 懒注册全部动画 (幂等; 缺 texture 的跳过, 不报错)
CrystalNpc.registerAnims = function (scene) {
    const cat = CrystalNpc.ANIM_CATALOG;
    for (const key in cat) {
        try {
            if (scene.anims.exists(key)) continue;
            if (!scene.textures.exists(key)) continue;
            const c = cat[key];
            scene.anims.create({
                key: key,
                frames: scene.anims.generateFrameNumbers(key, { start: 0, end: c.frames - 1 }),
                frameRate: c.fps,
                repeat: -1
            });
        } catch (e) {}
    }
};

if (typeof window !== 'undefined') window.CrystalNpc = CrystalNpc;