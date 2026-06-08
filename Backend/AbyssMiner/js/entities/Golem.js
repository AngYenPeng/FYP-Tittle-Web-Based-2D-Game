/**
 * Golem - SafeZone2 boss v3
 * - 双手浮在 boss 旁，左右随机/交替出招
 * - 攻击：手飞玩家位置 → 0.5s 警告 → 攻击 → 0.5s CD 衔接下个攻击
 * - 6 次攻击后落地 vulnerable 3s
 * - HP <= 150 (半血) 进 phase2 — boss 变红 + 两手同时攻击
 * - HP 300
 */
class Golem extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        // 优先用 G_sleep 作为初始 texture (sleep/dormant 状态), 否则 fallback Miner_stand
        const initTex = scene.textures.exists('G_sleep') ? 'G_sleep' : 'Miner_stand';
        super(scene, x, y, initTex, 0);
        scene.add.existing(this);
        scene.physics.add.existing(this);
        if (initTex === 'Miner_stand') {
            this.setTint(0x666666);
            this.setDisplaySize(80, 80);
        }
        // G_sleep 是 96×80 自然尺寸, scale 默认 1 不需要 setDisplaySize
        this.body.setSize(60, 60);
        this.body.setAllowGravity(false);
        this.setDepth(10);

        this.hp = 200;      // (用户) Easy 基准 300→200 (难度倍率走全局输出÷hpMul, 自动在此基础上翻)
        this.maxHp = 200;
        // 双手 HP (各 80 — (用户) Easy 基准 100→80), 死亡标记
        this._handLHp = 80;
        this._handRHp = 80;
        this._handLMaxHp = 80;
        this._handRMaxHp = 80;
        this.state = 'idle';
        this.bodyState = 'sleep';        // sleep | wake | head_eye (= 战斗时显示眼睛头像)
        this.attackCount = 0;
        this.cd = 0;
        this.vulnerableTimer = 0;
        this._vulnerableDuration = 3000;
        this._beetlesSpawnedThisVulnerable = 0;  // 这次落地已生成几只
        this._attackTurn = 0;       // 0 = L, 1 = R (alternating)
        this._phase2 = false;
        this._homeX = x;
        this._homeYair = y;
        this._homeYground = 23 * 32 - 40 - 64 - 32;  // 落地浮空 2 格 (不踩地面)
        this.isBoss = true;
        // 漂浮 (参考 E 交互图标的 sin 浮动, 速度 0.5×, 距离 1 格 = 32)
        this._floatPhase = Math.random() * Math.PI * 2;
        this._floatBaseY = y;

        // 两只手 — 用 GHand_rockR sprite (左手 flipX=true), idle 距 boss ±134 px
        const hasHand = scene.textures.exists('GHand_rockR');
        if (hasHand) {
            this._handL = scene.add.sprite(x - 134, y + 10, 'GHand_rockR');
            this._handL.setFlipX(true).setDepth(11);
            this._handR = scene.add.sprite(x + 134, y + 10, 'GHand_rockR');
            this._handR.setDepth(11);
        } else {
            // fallback: 矩形
            this._handL = scene.add.rectangle(x - 134, y + 10, 36, 36, 0x4a3a2a);
            this._handL.setStrokeStyle(2, 0x6a5a3a).setDepth(11);
            this._handR = scene.add.rectangle(x + 134, y + 10, 36, 36, 0x4a3a2a);
            this._handR.setStrokeStyle(2, 0x6a5a3a).setDepth(11);
        }
        this._handL._busy = false;
        this._handR._busy = false;
        this._handL._dead = false;
        this._handR._dead = false;
        // 手 hitbox 半宽 — 用于 clap 撞击检测 (默认 32 = 1 格半宽), 比 160 frame 小很多
        // 调小 → 手要更靠拢才停; 调大 → 手提早停
        this._handHitboxHalf = 32;
        this._handsVisible = false;  // 一开始不显示 (cinematic 完才出现)
        this._handL.setVisible(false);
        this._handR.setVisible(false);

        if (scene.uiCam) {
            try { scene.uiCam.ignore([this._handL, this._handR]); } catch(e) {}
        }

        const W = 100;
        this._hpBg = scene.add.rectangle(x, y - 80, W, 6, 0x111111).setDepth(20);
        this._hpBar = scene.add.rectangle(x - W/2, y - 80, W, 6, 0xff3333).setOrigin(0, 0.5).setDepth(21);
        this._hpBg.setVisible(false);   // 初始隐藏 — cinematic 完才显示
        this._hpBar.setVisible(false);

        // 手 HP 条 (各 40 宽 × 4 高, 跟主体同色 0xff3333)
        // 右手: 整体左移 8, 上移 16 → 偏移 (-8, -66)
        // 左手: 镜像 → 右移 8, 上移 16 → 偏移 (+8, -66)
        const HW = 40;
        this._handL_hpBg = scene.add.rectangle(this._handL.x + 8, this._handL.y - 66, HW, 4, 0x111111).setDepth(20);
        this._handL_hpBar = scene.add.rectangle(this._handL.x + 8 - HW/2, this._handL.y - 66, HW, 4, 0xff3333).setOrigin(0, 0.5).setDepth(21);
        this._handR_hpBg = scene.add.rectangle(this._handR.x - 8, this._handR.y - 66, HW, 4, 0x111111).setDepth(20);
        this._handR_hpBar = scene.add.rectangle(this._handR.x - 8 - HW/2, this._handR.y - 66, HW, 4, 0xff3333).setOrigin(0, 0.5).setDepth(21);
        this._handL_hpBg.setVisible(false);
        this._handL_hpBar.setVisible(false);
        this._handR_hpBg.setVisible(false);
        this._handR_hpBar.setVisible(false);
        if (scene.uiCam) {
            try { scene.uiCam.ignore([this._hpBg, this._hpBar, this._handL_hpBg, this._handL_hpBar, this._handR_hpBg, this._handR_hpBar]); } catch(e) {}
        }
    }

    /** 切换 boss body 显示状态 — 同时把 body hitbox 调到对应大小 */
    _setBodyState(state) {
        const sc = this.scene;
        this.bodyState = state;
        const setBody = (w, h) => {
            if (this.body) this.body.setSize(w * 0.7, h * 0.7);
        };
        if (state === 'sleep' && sc.textures.exists('G_sleep')) {
            this.anims.stop();
            this.setTexture('G_sleep');
            this.setScale(1);  // 自然尺寸 96×80
            setBody(96, 80);
            this.clearTint();
        } else if (state === 'wake_part1' && sc.anims.exists('g_wake_part1')) {
            this.setScale(1);  // 自然尺寸 288×128 (每 frame)
            setBody(288, 128);
            this.clearTint();
            this.play('g_wake_part1');
            if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(sc, 'GolemWakeUp');
        } else if (state === 'wake_part2' && sc.anims.exists('g_wake_part2')) {
            this.setScale(1);
            setBody(288, 128);
            this.clearTint();
            this.play('g_wake_part2');
        } else if (state === 'head_eye' && sc.textures.exists('GHead_eyeM')) {
            this.anims.stop();
            this.setTexture('GHead_eyeM');
            this.setScale(1);  // 自然尺寸 96×128
            setBody(96, 128);
            this.clearTint();
        } else if (state === 'mouth_opening' && sc.anims.exists('g_mouth_open')) {
            // 嘴张开 (0 → 7), 落地前播一次, 完成后停在 frame 7
            this.setScale(1);
            setBody(96, 128);
            this.play('g_mouth_open');
        } else if (state === 'mouth_open' && sc.textures.exists('GMouth')) {
            // 嘴张开停在最后一帧 (frame 7), vulnerable 期间用
            this.anims.stop();
            this.setTexture('GMouth', 7);
            this.setScale(1);
            setBody(96, 128);
        } else if (state === 'mouth_closing' && sc.anims.exists('g_mouth_open')) {
            // 嘴关闭 (7 → 0), 起飞时倒退播放
            this.setScale(1);
            setBody(96, 128);
            this.playReverse('g_mouth_open');
        }
    }

    /** 根据玩家 X 切眼睛 — boss 房 cell 8~33, 5 等分 (每 5 格), 从左到右: L2/L1/M/R1/R2 */
    _updateEye(playerX) {
        if (this.bodyState !== 'head_eye') return;
        const cellX = playerX / 32;
        // 8~33 = 25 格, 5 段
        let tex;
        if (cellX < 13) tex = 'GHead_eyeL2';
        else if (cellX < 18) tex = 'GHead_eyeL1';
        else if (cellX < 23) tex = 'GHead_eyeM';
        else if (cellX < 28) tex = 'GHead_eyeR1';
        else tex = 'GHead_eyeR2';
        if (this.texture.key !== tex && this.scene.textures.exists(tex)) {
            this.setTexture(tex);
        }
    }

    /** 双手显示 (orbit 起点调用) */
    showHands() {
        this._handsVisible = true;
        if (this._handL) this._handL.setVisible(true);
        if (this._handR) this._handR.setVisible(true);
    }

    /** HP bar 显示 (cinematic 完全结束才调用) */
    showHpBar() {
        if (this._hpBg) this._hpBg.setVisible(true);
        if (this._hpBar) this._hpBar.setVisible(true);
        // 手 HP 条 (只在手还活着才显示)
        if (this._handL_hpBg && !this._handL._dead) this._handL_hpBg.setVisible(true);
        if (this._handL_hpBar && !this._handL._dead) this._handL_hpBar.setVisible(true);
        if (this._handR_hpBg && !this._handR._dead) this._handR_hpBg.setVisible(true);
        if (this._handR_hpBar && !this._handR._dead) this._handR_hpBar.setVisible(true);
    }

    /** 旧 API 兼容 — 一次显示两个 */
    showHandsAndHpBar() {
        this.showHands();
        this.showHpBar();
    }

    update(time, delta, player) {
        if (this.hp <= 0) return;
        // dormant 状态完全冻结 — 不更新 HP bar / 不检测玩家 (cinematic 前 boss 在地上睡觉)
        if (this.state === 'dormant') return;
        if (this.cd > 0) this.cd -= delta;
        if (this.vulnerableTimer > 0) this.vulnerableTimer -= delta;

        // ====== HP 自动恢复: boss + 双手, 每 10 秒 +1 (上限 maxHp/handMaxHp) ======
        // 跨房间也会累积: scene.time.now 一直跑, 玩家不在 boss 房时 boss.update 不调,
        // 等回来再 elapsed 一次性补齐.
        if (this._lastRegenTime === undefined) {
            this._lastRegenTime = time;
        }
        const elapsedRegen = time - this._lastRegenTime;
        if (elapsedRegen >= 10000) {
            const ticks = Math.floor(elapsedRegen / 10000);   // (用户) 每 10 秒 1 跳
            // Boss 主体
            if (this.hp < this.maxHp) {
                this.hp = Math.min(this.maxHp, this.hp + ticks);
            }
            // 左手 (没死才补)
            if (this._handL && !this._handL._dead && this._handLHp < this._handLMaxHp) {
                this._handLHp = Math.min(this._handLMaxHp, this._handLHp + ticks);
            }
            // 右手 (没死才补)
            if (this._handR && !this._handR._dead && this._handRHp < this._handRMaxHp) {
                this._handRHp = Math.min(this._handRMaxHp, this._handRHp + ticks);
            }
            this._lastRegenTime += ticks * 10000;
        }

        this._hpBg.setPosition(this.x, this.y - 80);
        this._hpBar.setPosition(this.x - 50, this.y - 80);
        this._hpBar.scaleX = Math.max(0, this.hp / this.maxHp);

        // 手 HP 条同步 (左手 +8 右偏 -66 上偏; 右手 -8 左偏 -66 上偏)
        if (this._handL_hpBg && !this._handL._dead) {
            this._handL_hpBg.setPosition(this._handL.x + 8, this._handL.y - 66);
            this._handL_hpBar.setPosition(this._handL.x + 8 - 20, this._handL.y - 66);
            this._handL_hpBar.scaleX = Math.max(0, this._handLHp / this._handLMaxHp);
        }
        if (this._handR_hpBg && !this._handR._dead) {
            this._handR_hpBg.setPosition(this._handR.x - 8, this._handR.y - 66);
            this._handR_hpBar.setPosition(this._handR.x - 8 - 20, this._handR.y - 66);
            this._handR_hpBar.scaleX = Math.max(0, this._handRHp / this._handRMaxHp);
        }

        // 半血检测 → phase 2
        if (!this._phase2 && this.hp <= this.maxHp / 2) {
            this._phase2 = true;
            this.setTint(0xcc4444);  // 变红
            this._attackTurn = 0;  // phase 2 从左手起
        }

        if (this.state === 'idle') {
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            // 500 ≈ zone2 chunk 对角线(boss 中心到角)，刚好覆盖 zone2 镜头内
            if (dx*dx + dy*dy < 500 * 500) {
                this.state = 'floating';
                this.attackCount = 0;
                this.cd = 1000;
            }
            return;
        }

        if (this.state === 'floating') {
            // 漂浮: ±16 px (1 格), 速度 ~0.5× E 图标 (sin t*0.0015)
            const t = this.scene.time.now;
            const floatY = Math.sin(t * 0.0015 + this._floatPhase) * 16;
            this.y = this._homeYair + floatY;
            this.x = Phaser.Math.Linear(this.x, this._homeX, 0.05);
            // 跟玩家位置切眼睛
            this._updateEye(player.x);
            this._syncHandsIdle();

            // 触发攻击
            if (this.cd <= 0 && this.attackCount < 6) {
                if (this._phase2) {
                    // Phase 2: alternating LR — 每 0.75s 启动下一只手 (attack 0.75s 内会衔接)
                    const hand = (this._attackTurn === 0) ? this._handL : this._handR;
                    if (!hand._busy && !hand._dead) {
                        const type = Math.random() < 0.5 ? 'smash' : 'sweep';
                        this._startAttack(hand, type, player);
                        this._attackTurn = 1 - this._attackTurn;
                        this.attackCount++;
                        this.cd = 750;  // 0.75s 后下一手
                    } else if (hand._dead) {
                        // 跳过死手, 切到另一只
                        this._attackTurn = 1 - this._attackTurn;
                        this.cd = 100;
                    }
                } else {
                    // Phase 1: alternating LR — 严格单手 (两手都 free 才启动)
                    const hand = (this._attackTurn === 0) ? this._handL : this._handR;
                    if (!hand._busy && !hand._dead && !this._handL._busy && !this._handR._busy) {
                        const type = Math.random() < 0.5 ? 'smash' : 'sweep';
                        this._startAttack(hand, type, player);
                        this._attackTurn = 1 - this._attackTurn;
                        this.attackCount++;
                        this.cd = 500;
                    } else if (hand._dead) {
                        this._attackTurn = 1 - this._attackTurn;
                        this.cd = 100;
                    }
                }
            }

            // 双手都死 → 直接进入 attackCount 完成 → descend (送分模式)
            if (this._handL._dead && this._handR._dead) {
                this.attackCount = 6;
            }

            // 6 次完 + 双手都不 busy → 落地 (开始张嘴 mouth_opening)
            if (this.attackCount >= 6 && this.cd <= 0 && !this._handL._busy && !this._handR._busy) {
                this.state = 'descending';
                this._setBodyState('mouth_opening');  // 落地前播张嘴动画 (0→7)
            }
            return;
        }

        if (this.state === 'descending') {
            this.y = Phaser.Math.Linear(this.y, this._homeYground, 0.08);
            this._syncHandsIdle();
            if (Math.abs(this.y - this._homeYground) < 2) {
                this.y = this._homeYground;
                this.state = 'vulnerable';
                this.vulnerableTimer = this._vulnerableDuration;
                this._beetlesSpawnedThisVulnerable = 0;
                this._lastBeetleSpawnT = this.scene.time.now;
                this._setBodyState('mouth_open');  // 钉在 frame 7 (vulnerable 期间)
                this.setTint(this._phase2 ? 0xffaa66 : 0xaaff66);  // 变浅亮表示可受伤
            }
            return;
        }

        if (this.state === 'vulnerable') {
            this._syncHandsIdle();
            // 落地期间均匀生成 beetle: phase1=3 只, phase2=5 只
            const totalBeetles = this._phase2 ? 5 : 3;
            const interval = this._vulnerableDuration / totalBeetles;
            const now = this.scene.time.now;
            if (this._beetlesSpawnedThisVulnerable < totalBeetles &&
                now - this._lastBeetleSpawnT >= interval) {
                this._spawnBeetle();
                this._beetlesSpawnedThisVulnerable++;
                this._lastBeetleSpawnT = now;
            }
            if (this.vulnerableTimer <= 0) {
                this.state = 'ascending';   // 进入起飞 state (不是直接 floating)
                this._setBodyState('mouth_closing');  // 嘴反向关闭 (7→0)
                this.attackCount = 0;
                this.cd = 500;
                if (this._phase2) this.setTint(0xcc4444);
                else this.clearTint();
            }
            return;
        }

        if (this.state === 'ascending') {
            // 缓慢升回空中, 同时播 mouth_closing 反向动画 (在 _setBodyState 已经启动)
            this.y = Phaser.Math.Linear(this.y, this._homeYair, 0.08);
            this._syncHandsIdle();
            if (Math.abs(this.y - this._homeYair) < 2) {
                this.y = this._homeYair;
                this.state = 'floating';
                this._setBodyState('head_eye');  // 切回 5 张眼睛贴图 (后面 _updateEye 会动态切)
                if (this._phase2) this.setTint(0xcc4444);  // _setBodyState head_eye 会 clearTint, 重新应用 phase tint
            }
            return;
        }
    }

    /** 生成 1 只 HardrockBeetle 在 boss 当前位置 — boss 房内最多 8 只 (含活/动的) */
    _spawnBeetle() {
        const sc = this.scene;
        if (typeof HardrockBeetle === 'undefined' || !sc.beetles) return;
        // 限制: boss 房内最多 8 只 beetle (旧的死后才能补)
        const alive = sc.beetles.countActive ? sc.beetles.countActive(true) : sc.beetles.getChildren().filter(b => b && b.active).length;
        if (alive >= 8) return;
        try {
            const beetle = new HardrockBeetle(sc, this.x, this.y);
            beetle.setDepth(12);  // > boss body (10) + boss hands (11)
            sc.beetles.add(beetle);
            if (sc.walls) sc.physics.add.collider(beetle, sc.walls);
        } catch (e) {
            console.warn('[Golem] spawn beetle failed', e);
        }
    }

    _syncHandsIdle() {
        // 让 idle 手跟随 boss + sin 浮动 (替代 yoyo tween 避免冲突)
        // 距离 boss ±134 px (= 70 + 2格×32)
        const t = this.scene.time.now;
        const baseY = this.y + 10;
        const hover = Math.sin(t * 0.003) * 4;
        if (this._handL && !this._handL._busy && !this._handL._dead) {
            this._handL.x = this.x - 134;
            this._handL.y = baseY + hover;
        }
        if (this._handR && !this._handR._busy && !this._handR._dead) {
            this._handR.x = this.x + 134;
            this._handR.y = baseY + hover;
        }
    }

    _startAttack(hand, type, player) {
        hand._busy = true;
        this.scene.tweens.killTweensOf(hand);
        // 切手贴图: smash → GHand_rockR (石拳), sweep → GHand_palmR (手掌)
        if (hand.setTexture) {
            const tex = (type === 'sweep') ? 'GHand_palmR' : 'GHand_rockR';
            if (this.scene.textures.exists(tex)) {
                if (hand.anims && hand.anims.stop) hand.anims.stop();
                hand.setTexture(tex);
            }
        }
        const mul = this._phase2 ? 0.75 : 1.0;  // phase 2 时长 -25%
        if (type === 'smash') this._doSmash(hand, player, mul);
        else this._doSweep(hand, player, mul);
    }

    _doSmash(hand, player, mul = 1) {
        const sc = this.scene;
        const targetX = player.x;
        const flyY = this._homeYair - 20;

        // Step 1: hand 飞到玩家上方
        sc.tweens.add({
            targets: hand, x: targetX, y: flyY, duration: 200 * mul, ease: 'Cubic.easeOut',
            onComplete: () => {
                if (this.hp <= 0) { hand._busy = false; return; }
                const groundY = 23 * 32 - 32;
                const warnY   = groundY - 64;
                const fistY   = groundY - 64;
                let warning = null;
                if (!(window.AbyssDiff && AbyssDiff.mode === 'extreme')) {   // (用户) EXTREME 不给红色预警, 玩家拼反应
                    warning = sc.add.circle(targetX, warnY, 50, 0xff0000, 0.45)
                        .setStrokeStyle(2, 0xff3333).setDepth(18);
                    if (sc.uiCam) try { sc.uiCam.ignore(warning); } catch(e) {}
                }
                if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(sc, 'ReadySmash');
                sc.time.delayedCall(400 * mul, () => {
                    if (warning && warning.scene) warning.destroy();
                    if (this.hp <= 0) { hand._busy = false; return; }
                    let hit = false;
                    // 播 smash 动画 (5 frames @ 16fps = 312ms, 跟 strike tween ~200ms 时间差不大)
                    if (hand.anims && sc.anims.exists('g_hand_rock_smash')) {
                        hand.play('g_hand_rock_smash');
                    } else {
                        console.warn('[Golem] smash anim 不能播! anims:', !!hand.anims,
                            'anim exists:', sc.anims.exists('g_hand_rock_smash'),
                            'texture exists:', sc.textures.exists('GHand_rockR_smash'));
                    }
                    sc.tweens.add({
                        targets: hand, y: fistY, duration: 200 * mul, ease: 'Cubic.easeIn',
                        onUpdate: () => {
                            if (hit) return;
                            const p = sc.player;
                            if (!p || !p.body) return;
                            // hitbox = 当前 hand frame 大小 (displayWidth/Height)
                            const hW = (hand.displayWidth || 96) / 2;
                            const hH = (hand.displayHeight || 112) / 2;
                            if (Math.abs(p.x - hand.x) < hW && Math.abs(p.y - hand.y) < hH) {
                                if (!sc.isDashing && sc.healthSystem && sc.healthSystem.takeDamage) {
                                    const eff = sc.healthSystem.takeDamage(18 * (window.AbyssDiff ? AbyssDiff.get().dmgMul : 1));  // Golem: 18 HP × 难度
                                    // 有效命中 → +3% 侵蚀度
                                    if (eff && sc.diseaseSystem && sc.diseaseSystem.addCorrosion) sc.diseaseSystem.addCorrosion(3);
                                }
                                hit = true;
                                if (hand.setTint) hand.setTint(0xff4422); else hand.setFillStyle(0xff4422);
                            }
                        },
                        onComplete: () => {
                            if (typeof AudioSystem !== 'undefined') AudioSystem.sfxRandom(sc, ['Smash', 'Smash2']);
                            sc.cameras.main.shake(120 * mul, 0.005);
                            sc.time.delayedCall(50 * mul, () => this._returnHand(hand, mul));
                        }
                    });
                });
            }
        });
    }

    _doSweep(hand, player, mul = 1) {
        const sc = this.scene;
        const G = 32;
        const isLeft = (hand === this._handL);

        // ===== 1. 决定攻击侧 (50/50: 玩家左 或 右) =====
        const sideRight = Math.random() < 0.5;  // true = startX 在玩家右侧
        // ===== 2. 距离玩家 1~3 格 (32~96 px) =====
        const offset = G + Math.random() * 2 * G;
        // ===== 3. 起点 + 横扫方向 =====
        // 起点在右 → 从右往左横扫; 起点在左 → 从左往右
        let startX = sideRight ? player.x + offset : player.x - offset;
        const sweepDirRight = !sideRight;  // true = 横扫朝右
        const sweepRange = 16 * G;          // 16 格 = 512 px (用户要求翻倍)
        let endX = sweepDirRight ? startX + sweepRange : startX - sweepRange;

        // ===== 4. 限制在 boss 房 [cell 8 ~ 33] =====
        const roomLeft = 8 * G, roomRight = 33 * G;
        startX = Phaser.Math.Clamp(startX, roomLeft + 16, roomRight - 16);
        endX = Phaser.Math.Clamp(endX, roomLeft + 16, roomRight - 16);

        // ===== 5. armY = 固定高度 (跟原版一样, boss.y + 138, 不再跟玩家 y) =====
        const armY = (this.y + 10) + 4 * 32;

        // ===== 6. 判断是否要 180° 翻转手图 =====
        // 自然方向: 右手向左扫 (palm 朝左), 左手向右扫 (palm 朝右, flipX 镜像)
        // 不自然方向需要 180° 旋转让 palm 朝攻击方向
        const naturalDirRight = isLeft;  // 左手自然向右扫
        const needRotate = (sweepDirRight !== naturalDirRight);
        const targetRotation = needRotate ? Math.PI : 0;

        // ===== 7. 飞往 startX, 飞行途中 tween rotation 到目标值 =====
        sc.tweens.add({
            targets: hand,
            x: startX, y: armY,
            rotation: targetRotation,
            duration: 200 * mul,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                if (this.hp <= 0) { hand._busy = false; return; }

                // ===== 8. 红色警告 — 覆盖整个 sweepRange (256 px), 跟 sweep 同高度 =====
                let warning = null;
                if (!(window.AbyssDiff && AbyssDiff.mode === 'extreme')) {   // (用户) EXTREME 不给红色预警, 玩家拼反应
                    warning = sc.add.rectangle(startX, armY, sweepRange, 60, 0xff0000, 0.4)
                        .setOrigin(sweepDirRight ? 0 : 1, 0.5)
                        .setStrokeStyle(2, 0xff3333).setDepth(18);
                    if (sc.uiCam) try { sc.uiCam.ignore(warning); } catch(e) {}
                }
                if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(sc, 'ReadySwipe');

                sc.time.delayedCall(400 * mul, () => {
                    if (warning && warning.scene) warning.destroy();
                    if (this.hp <= 0) { hand._busy = false; return; }

                    let hit = false;
                    // 播 palm swipe 动画
                    if (hand.anims && sc.anims.exists('g_hand_palm_swipe')) {
                        hand.play('g_hand_palm_swipe');
                    }
                    if (typeof AudioSystem !== 'undefined') AudioSystem.sfxRandom(sc, ['Swipe', 'Swipe2']);
                    sc.tweens.add({
                        targets: hand, x: endX, duration: 400 * mul, ease: 'Sine.easeIn',
                        onUpdate: () => {
                            if (hit) return;
                            const p = sc.player;
                            if (!p || !p.body) return;
                            const hW = (hand.displayWidth || 112) / 2;
                            const hH = (hand.displayHeight || 120) / 2;
                            if (Math.abs(p.x - hand.x) < hW && Math.abs(p.y - hand.y) < hH) {
                                if (!sc.isDashing && sc.healthSystem && sc.healthSystem.takeDamage) {
                                    const eff = sc.healthSystem.takeDamage(18 * (window.AbyssDiff ? AbyssDiff.get().dmgMul : 1));
                                    if (eff && sc.diseaseSystem && sc.diseaseSystem.addCorrosion) sc.diseaseSystem.addCorrosion(3);
                                }
                                hit = true;
                                if (hand.setTint) hand.setTint(0xff4422);
                            }
                        },
                        onComplete: () => {
                            sc.time.delayedCall(50 * mul, () => this._returnHand(hand, mul));
                        }
                    });
                });
            }
        });
    }

    _returnHand(hand, mul = 1) {
        const sc = this.scene;
        // 停动画 + 还原 idle 贴图 (GHand_rockR)
        if (hand.anims && hand.anims.stop) hand.anims.stop();
        if (hand.setTexture && sc.textures.exists('GHand_rockR')) hand.setTexture('GHand_rockR');
        if (hand.clearTint) hand.clearTint(); else hand.setFillStyle(0x4a3a2a);
        const isLeft = (hand === this._handL);
        const homeX = isLeft ? this.x - 134 : this.x + 134;
        sc.tweens.add({
            targets: hand,
            x: homeX, y: this.y + 10,
            rotation: 0,    // 回到原位时 tween 旋转回 0 (若 sweep 时旋转过 180°)
            duration: 200 * mul, ease: 'Sine.easeInOut',
            onComplete: () => { hand._busy = false; }
        });
    }

    takeDamage(dmg) {
        // 任何状态都可以受伤 (空中 + 落地都行)
        if (this.hp <= 0) return;
        this.hp -= dmg;
        this.setTint(0xff6666);
        this.scene.time.delayedCall(200, () => {
            if (this.hp > 0) {
                if (this.state === 'vulnerable' || this.state === 'descending') {
                    // descending/vulnerable 用变亮色 (但 ascending 已经离开 vulnerable, 用普通 phase tint)
                    this.setTint(this._phase2 ? 0xffaa66 : 0xaaff66);
                } else if (this._phase2) {
                    this.setTint(0xcc4444);
                } else {
                    this.clearTint();
                }
            }
        });
        if (this.hp <= 0) this.die();
    }

    /** 玩家近战命中某只手 */
    takeHandDamage(hand, dmg) {
        if (!hand || hand._dead) return;
        if (hand === this._handL) {
            this._handLHp -= dmg;
            this._flashHand(hand);
            if (this._handLHp <= 0) this._killHand(hand);
        } else if (hand === this._handR) {
            this._handRHp -= dmg;
            this._flashHand(hand);
            if (this._handRHp <= 0) this._killHand(hand);
        }
    }

    _flashHand(hand) {
        if (hand.setTint) {
            hand.setTint(0xff6666);
            this.scene.time.delayedCall(200, () => {
                if (hand && !hand._dead && hand.clearTint) hand.clearTint();
            });
        }
    }

    /** 杀掉一只手 — 坠机落地 + boss -80 HP (body 也红闪 0.2s) */
    _killHand(hand) {
        if (!hand || hand._dead) return;
        hand._dead = true;
        hand._busy = false;
        this.scene.tweens.killTweensOf(hand);
        // 停掉手上的动画 + 切回 rock 贴图作为坠机最终形态
        if (hand.anims && hand.anims.stop) hand.anims.stop();
        if (hand.setTexture && this.scene.textures.exists('GHand_rockR')) hand.setTexture('GHand_rockR');
        // 隐藏该手的 HP 条
        if (hand === this._handL) {
            if (this._handL_hpBg) this._handL_hpBg.setVisible(false);
            if (this._handL_hpBar) this._handL_hpBar.setVisible(false);
        } else if (hand === this._handR) {
            if (this._handR_hpBg) this._handR_hpBg.setVisible(false);
            if (this._handR_hpBar) this._handR_hpBar.setVisible(false);
        }
        // 坠机: 飞到地面更深位置 (比 boss 死亡再低 2 格 = +64 px)
        // (用户) 死手下沉: 基准 1.5 格, 左手再 +1 格, 右手再 +2 格
        const _extra = (hand === this._handL) ? 32 : 64;
        const groundY = this._homeYground + 4 + 64 + 48 + _extra;
        this.scene.tweens.add({
            targets: hand,
            y: groundY,
            angle: Phaser.Math.Between(-90, 90),
            duration: 800,
            ease: 'Cubic.easeIn',
            onComplete: () => {
                if (hand.setAlpha) hand.setAlpha(0.5);
                if (hand.setTint) hand.setTint(0x666666);
            }
        });
        // Boss 主体扣 80 HP + 触发独立红闪 (via takeDamage 走标准流程)
        this.takeDamage(80);
    }

    die() {
        // (用户成就) 外科手术: 双手皆断后击杀本体
        if (typeof AchievementSystem !== 'undefined' && this._handLHp <= 0 && this._handRHp <= 0) AchievementSystem.unlock(this.scene, 'sz2_surgical');
        this.hp = 0;
        this.state = 'dead';
        if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this.scene, 'Golem Death');
        this.setTint(0x333333);
        // (用户) 死亡瞬间渲染优先级压到神像 (depth -3) 之下 — 尸体不再盖住升起的神像
        this.setDepth(-4);
        if (this._handL && this._handL.setDepth) this._handL.setDepth(-4);
        if (this._handR && this._handR.setDepth) this._handR.setDepth(-4);
        if (this._hpBg) this._hpBg.destroy();
        if (this._hpBar) this._hpBar.destroy();
        // 手 HP 条也销毁
        if (this._handL_hpBg) this._handL_hpBg.destroy();
        if (this._handL_hpBar) this._handL_hpBar.destroy();
        if (this._handR_hpBg) this._handR_hpBg.destroy();
        if (this._handR_hpBar) this._handR_hpBar.destroy();
        // 双手处理:
        // - 已死 (_dead=true) → 不再走死亡 tween, 半透明灰色留在地上 (已经在 _killHand 里设置过)
        // - 还活 → 跟 boss 平行坠机
        const groundY = this._homeYground + 4;
        [this._handL, this._handR].forEach(hand => {
            if (!hand) return;
            if (hand._dead) {
                // 已死手: 确保半透明灰色 (兜底)
                if (hand.setAlpha) hand.setAlpha(0.5);
                if (hand.setTint) hand.setTint(0x666666);
            } else {
                // 跟 boss 平行坠机
                this.scene.tweens.killTweensOf(hand);
                this.scene.tweens.add({
                    targets: hand,
                    y: groundY,
                    angle: Phaser.Math.Between(-90, 90),
                    alpha: 0.5,
                    duration: 800,
                    ease: 'Cubic.easeIn'
                });
            }
        });
        this.scene.events.emit('golem_died', { x: this.x, y: this.y });
        this.scene.tweens.add({
            targets: this,
            angle: 90,
            y: this._homeYground + 4,
            duration: 800,
            ease: 'Cubic.easeIn'
        });
    }
}