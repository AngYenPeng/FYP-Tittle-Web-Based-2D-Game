/**
 * HealthSystem — 血量条 + 爱心生命数
 *
 * 阶段 3 改造:
 * - 血量 HP (0-100): 怪物/Boss 攻击扣 HP
 * - 爱心 hearts (0-5): HP 到 0 → -1 爱心 + 回满 HP; 爱心到 0 → 死亡返回大厅
 * - UI: 左上角 [血量条] + 右侧"x5"爱心数
 * - 后续 (阶段 4) 会接入腐蚀度条
 */
class HealthSystem {
    constructor(scene) {
        this.scene = scene;
        // === 新系统 ===
        this.maxHp = 100;
        this.hp = 100;
        const _dh = (window.AbyssDiff ? AbyssDiff.get().hearts : 5);   // (用户) 难度: easy5 / normal3 / hard,extreme1
        this.maxHearts = _dh;
        this.hearts = _dh;
        this.isDead = false;

        // === 旧 API 兼容 (保留属性, 别处可能引用) ===
        this.playerHp = this.hp;      // 旧别名
        this.halfHp = this.maxHp;     // 旧别名 (虽然语义不同)
        this.heartSprites = [];       // 旧迭代器, 保留空数组防止 setHUDVisible 报错
        this.shieldOverlays = [];     // 旧迭代器
        this.shieldCount = 0;         // 护盾药水已删, 永远 0

        // UI 元素
        this.hpBarBg = null;
        this.hpBarFill = null;
        this.hpBarBorder = null;
        this.hpText = null;
        this.heartsText = null;

        // 死亡面板
        this.deathPanel = null;
        this.deathText = null;
        this.deathCountdown = 0;
        this.returningToHub = false;
    }

    init() {
        const s = this.scene;

        // === HP 条 ===
        // 老爱心中心 (60,60), 现在 HP 条中心 y=60 保持垂直一致
        // 水晶仍在 y=120, guide 仍在 y=180, 间距 60 不变
        const barX = 24;          // 左边起点
        const barY = 60;          // 上下中心 (跟老爱心一致)
        const barW = 240;
        const barH = 28;

        // (用户) 图片血条: HpBar 框 108×14 + HpBar_Fill 填充 100×5 (×2 缩放, 中心对齐, 框压填充); 缺图回退旧矩形
        this._imgHpBar = s.textures.exists('HpBar') && s.textures.exists('HpBar_Fill');
        if (this._imgHpBar) {
            const cxBar = barX + 108;   // 216 宽的中心, 左缘与原条对齐
            this.hpBarBg = null;
            this.hpBarFill = s.add.image(cxBar, barY, 'HpBar_Fill').setScale(2).setDepth(201).setScrollFactor(0);
            this.hpBarBorder = s.add.image(cxBar, barY, 'HpBar').setScale(2).setDepth(202).setScrollFactor(0);
        } else {
            this.hpBarBg = s.add.rectangle(barX, barY, barW, barH, 0x222222, 0.85)
                .setOrigin(0, 0.5).setDepth(200).setScrollFactor(0);
            this.hpBarFill = s.add.rectangle(barX + 2, barY, barW - 4, barH - 4, 0xdd2222, 1)
                .setOrigin(0, 0.5).setDepth(201).setScrollFactor(0);
            this.hpBarBorder = s.add.rectangle(barX, barY, barW, barH)
                .setOrigin(0, 0.5).setDepth(202).setScrollFactor(0)
                .setStrokeStyle(2, 0xffffff).setFillStyle();
        }

        this.hpText = s.add.text(this._imgHpBar ? (barX + 108) : (barX + barW / 2), barY, '100 / 100', {   // (用户) 图片条中心 = barX+108 (216 宽), 旧条 = barX+120
            fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
            fontFamily: '"VT323", monospace', stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5).setDepth(203).setScrollFactor(0);

        // === 爱心数 (右侧 "x5") — (用户) 有 Heart 贴图: 图标 + xN; 缺图回退旧 ❤ 文本 ===
        if (s.textures.exists('Heart')) {
            this.heartIcon = s.add.image(barX + barW + 6, barY, 'Heart')   // (用户) 左移 8px
                .setDisplaySize(26, 26).setOrigin(0, 0.5).setDepth(203).setScrollFactor(0);
            this.heartsText = s.add.text(barX + barW + 6 + 30, barY, 'x' + this.hearts, {   // (用户) 跟图标一起左移 8px
                fontSize: '26px', color: '#ff5577', fontStyle: 'bold',
                fontFamily: '"VT323", monospace', stroke: '#000', strokeThickness: 4
            }).setOrigin(0, 0.5).setDepth(203).setScrollFactor(0);
        } else {
            this.heartsText = s.add.text(barX + barW + 4, barY, '❤x' + this.hearts, {   // (用户) 左移 8px (回退文本版)
                fontSize: '26px', color: '#ff5577', fontStyle: 'bold',
                fontFamily: '"VT323", monospace', stroke: '#000', strokeThickness: 4
            }).setOrigin(0, 0.5).setDepth(203).setScrollFactor(0);
        }

        // === 死亡面板 ===
        const cx = s.cameras.main.width / 2;
        const cy = s.cameras.main.height / 2;
        this.deathPanel = s.add.container(cx, cy).setScrollFactor(0).setDepth(300).setVisible(false);
        const bg = s.add.rectangle(0, 0, 800, 150, 0x000000, 0.85);
        this.deathText = s.add.text(0, 0, 'YOU DIED', {
            fontSize: '52px', color: '#ff4444',
            fontFamily: '"VT323", monospace'
        }).setOrigin(0.5);
        this.deathPanel.add([bg, this.deathText]);

        this.updateUI();
    }

    /**
     * 受伤. 返回 true 表示"有效命中" (扣血成功), false 表示被无敌挡掉.
     * 怪物攻击后用返回值决定要不要附加 corrosion / DoT / slow 等副作用.
     *
     * @param {number} amount HP 伤害量
     * @param {object} opts
     *   - ignoreIframe: bool   绕过无敌检查 (DoT / 蜘蛛 cling / 满侵蚀度扣血 用)
     *   - triggerIframe: bool  这次扣血是否触发新的 0.75s 无敌 (默认 true)
     */
    takeDamage(amount = 10, opts = {}) {
        if (this.isDead) return false;
        if (this.scene._creativeInvincible) return false;

        const ignoreIframe   = opts.ignoreIframe === true;
        const triggerIframe  = opts.triggerIframe !== false;

        if (!ignoreIframe && this.scene.isPlayerInvincible) {
            return false;
        }

        this.hp = Math.max(0, this.hp - amount);
        this.playerHp = this.hp;
        // (用户) 难度侵蚀: 每次有效受伤 normal +1% / hard +2% / extreme +3% (easy 不加).
        //   腐蚀满自扣血调用带 noCorrosion 防自喂循环.
        if (!opts.noCorrosion) {
            const _ca = { normal: 1, hard: 2, extreme: 3 }[(window.AbyssDiff && AbyssDiff.mode) || 'easy'] || 0;
            if (_ca && this.scene.diseaseSystem && this.scene.diseaseSystem.addCorrosion) {
                this.scene.diseaseSystem.addCorrosion(_ca);
            }
        }
        if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this.scene, 'MinerHurt');  // 玩家受伤音效

        // 红闪 0.2 秒 (每次有效扣血都闪)
        this._flashRed(200);

        if (triggerIframe) {
            this._triggerInvincibility(750);
        }

        if (this.hp <= 0) {
            this._loseHeart();
        }
        this.updateUI();
        return true;
    }

    /** 别名 — SpiderQueenBoss 用 damage(15). 默认带 iframe, 走标准路径 */
    damage(amount) { return this.takeDamage(amount); }

    /** 0.2 秒红色闪烁 (每次有效扣血触发) — 与 iframe 透明效果共存 */
    _flashRed(ms) {
        const s = this.scene;
        if (!s.player || !s.player.setTint) return;
        s.player.setTint(0xff3333);
        if (this._flashTimer) {
            try { this._flashTimer.remove(); } catch(e) {}
        }
        this._flashTimer = s.time.delayedCall(ms, () => {
            if (s.player && s.player.clearTint && !this.isDead) {
                s.player.clearTint();
            }
        });
    }

    /** 触发 N ms 无敌. 多次调用会重置计时 (取最后一次) */
    _triggerInvincibility(ms) {
        const s = this.scene;
        s.isPlayerInvincible = true;
        if (s.player && s.player.setAlpha) s.player.setAlpha(0.4);
        if (this._iframeTimer) {
            try { this._iframeTimer.remove(); } catch(e) {}
        }
        this._iframeTimer = s.time.delayedCall(ms, () => {
            if (!this.isDead && !this.returningToHub) {
                s.isPlayerInvincible = false;
                if (s.player && s.player.setAlpha) s.player.setAlpha(1);
            }
        });
    }

    /** HP 归零 → 扣 1 爱心. 爱心剩余 → 5 秒倒计时 → 复活在最新存档点. 爱心归零 → 永久死亡返回大厅 */
    _loseHeart() {
        this.hearts--;
        // (用户成就) 死亡记录: 本区死过 (区成就) + 全程死亡计数 (一命通关)
        this.scene._achDiedHere = true;
        try { if (this.scene.registry) this.scene.registry.set('runDeaths', (this.scene.registry.get('runDeaths') || 0) + 1); } catch (e) {}
        if (this.hearts <= 0) {
            this.hearts = 0;
            this._permanentDeath();
            return;
        }
        // 还有爱心 → 5 秒倒计时 → 传送到最新存档点
        this._startRespawnCountdown();
    }

    /** 5 秒死亡倒计时 (HP=0 但还有爱心) */
    _startRespawnCountdown() {
        const s = this.scene;
        this.isDead = true;
        s.isDead = true;
        // (用户) 死亡前撤冲刺/抓钩 — Miner_dead 帧替换 dash 帧时 origin/offset 失配会瞬移嵌墙坠出世界
        if (s.dashSystem && s.dashSystem.cancelDash) s.dashSystem.cancelDash();
        if (s.grappleSystem && s.grappleSystem.stopGrapple && (s.isGrappling || s.isHanging)) s.grappleSystem.stopGrapple();
        if (s._freezeMonstersOnDeath) s._freezeMonstersOnDeath();   // (用户) 怪物速度清零, 防死后滑行/飞出
        s.isPlayerStunned = true;
        s.isPlayerInvincible = true;
        if (typeof AudioSystem !== 'undefined') AudioSystem.playGameOver(s);   // (用户) 死亡 BGM, 复活守门等它播完
        if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(s, 'Death_Grow');   // (用户) 死亡瞬间音效
        if (s.diseaseSystem && s.diseaseSystem.resetOnDeath) s.diseaseSystem.resetOnDeath();   // (用户) 死亡清侵蚀/中毒 — 修复复活后无限扣血

        if (s.player) {
            // (用户) Miner_dead 死亡动画: 播 7 帧定格末帧; 空中死保留重力, 边播边落地 (与墙 collider 已存在); 缺图回退旧灰影
            if (s.textures.exists('Miner_dead')) {
                if (!s.anims.exists('miner_dead')) {
                    const _ft = s.textures.get('Miner_dead').frameTotal;
                    s.anims.create({ key: 'miner_dead', frames: s.anims.generateFrameNumbers('Miner_dead', { start: 0, end: Math.max(0, _ft - 2) }), frameRate: 10, repeat: 0 });
                }
                s.player.clearTint();
                s.player.setAlpha(1);
                try { s.player.play('miner_dead'); } catch (e) {}
                // (用户) 死亡动画整体下移 16px — body offset 反向补偿, 碰撞位置在世界里不变 (纯视觉)
                s.player.y += 16;
                if (s.player.body && s.player.body.offset) s.player.body.setOffset(s.player.body.offset.x, s.player.body.offset.y - 16);
                if (s.player.body) {
                    s.player.body.setVelocityX(0);
                    s.player.body.setAllowGravity(true);
                    // (用户) 尸体穿墙修复: immovable 的动态体撞静态墙时分离逻辑两边都动不了 → 直接穿过.
                    //   尸体保持可推动 (hitbox 即活体 body, 原样不变), 与墙正常碰撞落地
                    s.player.body.setImmovable(false);
                }
            } else {
                s.player.setTint(0x555555);
                s.player.setAlpha(0.6);
                if (s.player.body) {
                    s.player.body.setVelocity(0, 0);
                    s.player.body.setAllowGravity(false);
                    s.player.body.setImmovable(true);
                }
            }
        }

        if (this.deathPanel) this.deathPanel.setVisible(false);   // 改用黑屏爱心动画, 不显示文字面板
        this.deathCountdown = 0;
        // 死亡黑屏爱心动画 (死前爱心数 = 当前+1, _loseHeart 已先扣) → 碎完即复活到存档点
        if (s._deathHeartAnim) {
            this._deathAnimPlaying = true;   // 动画期间挡住 update 倒计时
            s._deathHeartAnim(this.hearts + 1, () => { this._deathAnimPlaying = false; this._doRespawnAtCheckpoint(); });
            // 兜底: 动画链若被切后台打断 (tab 失焦), 最多 3.5s 强制复活+清覆盖层, 防侵蚀条/碎片 UI 卡死
            s.time.delayedCall(3500, () => {
                if (this._deathAnimPlaying) { this._deathAnimPlaying = false; this._doRespawnAtCheckpoint(); }
            });
        } else {
            this.deathPanel.setVisible(true);
            this.deathCountdown = 5000;
            this.deathText.setText('RESPAWNING IN 5...');
        }
    }

    /** 5 秒倒计时结束 → 复活在最新存档点 */
    _doRespawnAtCheckpoint() {
        // (用户) GameOver BGM 要完整播完才复活 — 没播完则等 complete 再走 (死亡总时长 = max(动画, 曲长))
        if (typeof AudioSystem !== 'undefined' && AudioSystem.gameOverPlaying && AudioSystem.gameOverPlaying()) {
            if (!this._gameOverWait) {
                this._gameOverWait = true;
                AudioSystem._gameOver.once('complete', () => { this._gameOverWait = false; this._doRespawnAtCheckpoint(); });
            }
            return;
        }
        const s = this.scene;
        // 优先用激活的 checkpoint, 否则用 spawn 点
        const spawnX = (s._activeCheckpoint && s._activeCheckpoint.x !== undefined) ? s._activeCheckpoint.x : s.spawnX;
        const spawnY = (s._activeCheckpoint && s._activeCheckpoint.y !== undefined) ? s._activeCheckpoint.y : s.spawnY;

        this.hp = this.maxHp;
        this.playerHp = this.hp;
        this.isDead = false;
        s.isDead = false;
        s.isPlayerStunned = false;

        // 清侵蚀度 (复活时清零)
        if (s.diseaseSystem && s.diseaseSystem.resetOnDeath) s.diseaseSystem.resetOnDeath();   // (用户) resetOnDeath ⊇ reset, 多清"趴身蜘蛛计数 + 让蜘蛛松手" — 修复被蜘蛛趴身致死后复活仍无限扣血 (死亡动画期间蜘蛛又趴回来, reset 不清趴身)

        if (s.player) {
            s.player.clearTint();
            s.player.setAlpha(1);
            if (s.player.body) {
                s.player.body.setAllowGravity(true);
                s.player.body.setImmovable(false);
                s.player.body.reset(spawnX, spawnY);
            }
        }

        // pick 收回 + 钩状态清零
        if (s.pick1 && s.pick1.state !== 'idle' && s.pick1.backToInventory) s.pick1.backToInventory();
        if (s.pick2 && s.pick2.state !== 'idle' && s.pick2.backToInventory) s.pick2.backToInventory();
        s.inv = { left: true, right: true };
        s.isGrappling = false;
        s.activeGrapplePick = null;

        this.deathPanel.setVisible(false);
        if (s._deathClearOverlay) s._deathClearOverlay();   // 淡出死亡黑屏爱心覆盖层

        // (用户修复) 死亡打断剧情/对话的残局清理 — 否则复活后:
        //   - 卡住的隐形对话每帧吞掉 E 的 JustDown → 商人等交互全部失灵
        //   - _cinematicLock 残留 → 剧情机器/图标全卡
        //   - 剧情 stopFollow+zoom 残留 → 要跨 chunk 让镜头逻辑重设才恢复 (用户报告的"自愈"现象)
        if (s.dialogSystem && s.dialogSystem.isOpen && s.dialogSystem.close) { try { s.dialogSystem.close(); } catch (e) {} }
        s._cinematicLock = false;
        // (用户审计) 一次性传送闩 — 死亡原地复活(场景不重建)必须复位, 否则跨场景传送被怪打断后门/区间交互永久失效
        s._teleporting = false;
        s._teleportingToSafeZone2 = false;
        s._teleportingToSafeZone4 = false;
        s._sz1MerchantPending = false;
        if (!s._sz1MerchantCutsceneDone) s._sz1MerchantCutsceneStarted = false;   // 死亡打断 → 允许剧情重播
        if (s._savedCameraZoom != null && s.cameras && s.cameras.main) {
            try {
                s.cameras.main.setZoom(s._savedCameraZoom);
                s._savedCameraZoom = null;
                if (s.player) s.cameras.main.startFollow(s.player, true, 0.08, 0.08);
            } catch (e) {}
        }

        // 复活后短暂无敌 1 秒
        this._triggerInvincibility(1000);
        this.updateUI();
    }

    /** 爱心归零 → 死亡, 2 秒后返回 HubScene */
    _permanentDeath() {
        if (this.returningToHub) return;
        this.returningToHub = true;
        this.isDead = true;
        const s = this.scene;
        s.isDead = true;
        // (用户) 同上: 永久死亡前撤冲刺/抓钩
        if (s.dashSystem && s.dashSystem.cancelDash) s.dashSystem.cancelDash();
        if (s.grappleSystem && s.grappleSystem.stopGrapple && (s.isGrappling || s.isHanging)) s.grappleSystem.stopGrapple();
        if (s._freezeMonstersOnDeath) s._freezeMonstersOnDeath();   // (用户) 怪物速度清零, 防死后滑行/飞出
        // (用户) 最后一颗心: 不播旧死亡音效 (Death_Grow / GameOver BGM) — 心跳 Heartbeat 接管全部听觉舞台,
        //   死亡 BGM 由 DeathScene 进场自己起
        if (typeof AudioSystem !== 'undefined') AudioSystem.stopBGM();
        s.isPlayerStunned = true;
        if (s.diseaseSystem && s.diseaseSystem.resetOnDeath) s.diseaseSystem.resetOnDeath();   // (用户) 永久死亡同样清侵蚀/中毒

        if (s.player) {
            // (用户) Miner_dead 死亡动画: 播 7 帧定格末帧; 空中死保留重力, 边播边落地 (与墙 collider 已存在); 缺图回退旧灰影
            if (s.textures.exists('Miner_dead')) {
                if (!s.anims.exists('miner_dead')) {
                    const _ft = s.textures.get('Miner_dead').frameTotal;
                    s.anims.create({ key: 'miner_dead', frames: s.anims.generateFrameNumbers('Miner_dead', { start: 0, end: Math.max(0, _ft - 2) }), frameRate: 10, repeat: 0 });
                }
                s.player.clearTint();
                s.player.setAlpha(1);
                try { s.player.play('miner_dead'); } catch (e) {}
                // (用户) 死亡动画整体下移 16px — body offset 反向补偿, 碰撞位置在世界里不变 (纯视觉)
                s.player.y += 16;
                if (s.player.body && s.player.body.offset) s.player.body.setOffset(s.player.body.offset.x, s.player.body.offset.y - 16);
                if (s.player.body) {
                    s.player.body.setVelocityX(0);
                    s.player.body.setAllowGravity(true);
                    // (用户) 尸体穿墙修复: immovable 的动态体撞静态墙时分离逻辑两边都动不了 → 直接穿过.
                    //   尸体保持可推动 (hitbox 即活体 body, 原样不变), 与墙正常碰撞落地
                    s.player.body.setImmovable(false);
                }
            } else {
                s.player.setTint(0x555555);
                s.player.setAlpha(0.5);
                if (s.player.body) {
                    s.player.body.setVelocity(0, 0);
                    s.player.body.setAllowGravity(false);
                    s.player.body.setImmovable(true);
                }
            }
        }

        if (this.deathPanel) this.deathPanel.setVisible(false);   // 改用黑屏爱心动画
        // (用户) 彻底死亡: 当前存档打上阵亡标记 (槽位列表显示 FALLEN, 不可继续), 然后回主页
        try {
            if (typeof SaveSystem !== 'undefined' && SaveSystem.getCurrentSlot) {
                const _slot = SaveSystem.getCurrentSlot();
                if (_slot != null) {
                    const _d = SaveSystem.getSlot(_slot) || SaveSystem.captureFromScene(s) || {};
                    _d.dead = true;
                    SaveSystem.saveSlot(_slot, _d);
                }
            }
        } catch (e) {}
        // (用户) 最后一颗心专属序列: 世界缓黑 → LastLive 心碎动画(55帧)+Heartbeat 心跳 → 全黑 → DeathScene (两张图 cutscene → GAME OVER → Title)
        this._lastLiveSequence();
    }

    /** (用户) 最后一心碎裂演出. 贴图键 LastLive/LastLife 双名兼容; 心跳 Heartbeat 无条件播 (回退路径也响);
     *  分层与 _deathHeartAnim 完全同款 (cam 尺寸 + scrollFactor0 + depth 99999 + uiCam ignore). 图缺失 → 回退旧爱心动画, 同样进 DeathScene */
    _lastLiveSequence() {
        const s = this.scene;
        const goDeath = () => { try { s.scene.start('DeathScene'); } catch (e) { if (s.scene && s.scene.start) s.scene.start('TitleScene'); } };
        // 双名解析 + 用点现注册 (SZ 场景不跑 GameScene.create 的注册簇)
        const texKey = s.textures.exists('LastLive') ? 'LastLive' : (s.textures.exists('LastLife') ? 'LastLife' : null);
        if (texKey && s.anims && !s.anims.exists('lastlive_anim')) {
            try { s.anims.create({ key: 'lastlive_anim', frames: s.anims.generateFrameNumbers(texKey, { start: 0, end: 54 }), frameRate: 17, repeat: 0 }); } catch (e) {}
        }
        // (用户) 心跳 — 最后一颗心的唯一听觉, 无论走主路还是回退都播.
        //   拿到声音对象 → 心跳播完后接 LastLifeBreak 碎心声 (用户要求: 心跳放完才放碎心声)
        let _heartbeatObj = null;
        if (typeof AudioSystem !== 'undefined') {
            if (s.cache && s.cache.audio && s.cache.audio.exists('Heartbeat')) {
                try { _heartbeatObj = s.sound.add('Heartbeat'); _heartbeatObj.play({ volume: AudioSystem.sfxVolume }); } catch (e) { _heartbeatObj = null; }
            }
            if (!_heartbeatObj) AudioSystem.sfx(s, 'Heartbeat', { volume: AudioSystem.sfxVolume });   // 拿不到对象(缺文件等) → 全局播放兜底
        }
        if (!texKey || !s.anims || !s.anims.exists('lastlive_anim')) {
            console.warn('[LastLive] 贴图缺失: 需要 assets/images/LastLive.png 或 LastLife.png (2200×40 / 55帧) — 回退旧爱心动画');
            // 回退: LastLifeBreak 由 _deathHeartAnim(1) 负责 (动画开始1秒后), 此处不再挂心跳→碎心声 以免重复
            if (s._deathHeartAnim) s._deathHeartAnim(1, goDeath);
            else s.time.delayedCall(1500, goDeath);
            return;
        }
        // (用户) 主路: 心跳播完 → 放 LastLifeBreak 碎心声 (拿不到心跳对象时直接放, 不卡)
        if (typeof AudioSystem !== 'undefined') {
            if (_heartbeatObj) _heartbeatObj.once('complete', () => { try { AudioSystem.sfx(s, 'LastLifeBreak', { volume: AudioSystem.sfxVolume }); } catch (e) {} try { _heartbeatObj.destroy(); } catch (e) {} });
            else AudioSystem.sfx(s, 'LastLifeBreak', { volume: AudioSystem.sfxVolume });
        }
        const cam = s.cameras.main;
        const cw = cam.width, ch = cam.height;
        // ① 背后游戏逐渐黑掉 (1.4s 全黑) — _deathHeartAnim 同款分层
        const black = s.add.rectangle(cw / 2, ch / 2, cw, ch, 0x000000, 1).setScrollFactor(0).setDepth(99999).setAlpha(0);
        if (s.uiCam) { try { cam.ignore(black); } catch (e) {} }
        s.tweens.add({
            targets: black, alpha: 1, duration: 1400, ease: 'Quad.easeIn',
            onComplete: () => {
                // ② 全黑后中央心碎动画 (心跳已起播, 早结束无妨)
                const heart = s.add.sprite(cw / 2, ch / 2, texKey).setScrollFactor(0).setDepth(100000).setScale(7);
                if (s.uiCam) { try { cam.ignore(heart); } catch (e) {} }
                try { heart.texture.setFilter(Phaser.Textures.FilterMode.NEAREST); } catch (e) {}
                heart.play('lastlive_anim');
                heart.once('animationcomplete', () => {
                    // ③ 心碎完 → 彻底黑屏一拍 → DeathScene
                    heart.setVisible(false);
                    s.time.delayedCall(600, goDeath);
                });
                // 兜底: 切后台动画事件丢失 → 5s 强制推进
                s.time.delayedCall(5000, () => { if (heart.visible) goDeath(); });
            }
        });
    }

    /**
     * 治疗 — units 个单位, 每单位 +50% HP (治疗药水 1 瓶 = 1 unit = +50%)
     * 旧代码 heal(3) 会被这里加 150%, 等同回满
     */
    heal(units = 1) {
        const add = Math.round(this.maxHp * 0.5 * units);
        this.hp = Math.min(this.maxHp, this.hp + add);
        this.playerHp = this.hp;
        this.updateUI();
        this.showHealFx();   // (用户) 回血特效
    }

    /** (用户) 回血特效: Healing 640×80/10帧, 完全跟随主角; 持续回血 = 持续刷新到期时间循环播放 */
    showHealFx() {
        const s = this.scene;
        if (!s || !s.player || !s.anims) return;
        // (用户修复) 动画用点现注册 — 注册簇只在主矿洞 create 跑, SZ 场景全缺 → 此前静默退出, 回血特效从未显示
        if (!s.anims.exists('healing_anim') && s.textures.exists('Healing')) {
            try { s.anims.create({ key: 'healing_anim', frames: s.anims.generateFrameNumbers('Healing', { start: 0, end: 9 }), frameRate: 14, repeat: -1 }); } catch (e) {}
        }
        if (!s.anims.exists('healing_anim')) return;
        if (!this._healFx || !this._healFx.scene) {
            this._healFx = s.add.sprite(s.player.x, s.player.y, 'Healing')
                .setDepth((s.player.depth || 10) + 1).play('healing_anim');
            if (s.uiCam) { try { s.uiCam.ignore(this._healFx); } catch (e) {} }
        }
        this._healFx.setVisible(true);
        if (!this._healFx.anims.isPlaying) this._healFx.play('healing_anim');
        this._healFxUntil = s.time.now + 700;
        // (用户) Heal 音效: 治疗动画出现就播 1 次, 必须播完才能再播 (sfx 返回 sound, 查 isPlaying)
        if (typeof AudioSystem !== 'undefined' && (!this._healSnd || !this._healSnd.isPlaying)) {
            this._healSnd = AudioSystem.sfx(s, 'Heal');
        }
    }

    /** 增命药水 — +1 爱心 (不超过 maxHearts) */
    addHeart(n = 1) {
        this.hearts = Math.min(this.maxHearts, this.hearts + n);
        this.updateUI();
    }

    /** 旧 API: 护盾药水已删除, 保留空实现 */
    addShield() {}
    canShield() { return false; }
    currentFullHearts() { return this.hearts; }

    canHeal() {
        return this.hp < this.maxHp;
    }

    /** 治疗到满 HP (旧 API, 留兼容) */
    healToFull() {
        this.hp = this.maxHp;
        this.playerHp = this.hp;
        this.updateUI();
    }

    /** 治疗 N HP (Checkpoint 每秒回血用) */
    healAmount(n) {
        this.hp = Math.min(this.maxHp, this.hp + n);
        this.playerHp = this.hp;
        this.updateUI();
    }

    /** 存档恢复后调用, 重新刷新 UI */
    refresh() { this.updateUI(); }

    updateUI() {
        // (用户成就) 我是如何走到这一步的: 腐蚀 ≥100% 且 hp 恰好 1
        if (typeof AchievementSystem !== 'undefined' && this.hp === 1 && this.scene.diseaseSystem && this.scene.diseaseSystem.corrosionPct >= 100) AchievementSystem.unlock(this.scene, 'rock_bottom');
        if (!this.hpBarFill) return;
        const pct = Math.max(0, this.hp / this.maxHp);
        if (this._imgHpBar) {
            // (用户) 图片填充按血量从右往左裁: 纹理 100px = 100%, 50% → 右半 50px 隐藏
            this.hpBarFill.setCrop(0, 0, Math.round(100 * pct), 5);
        } else {
            const barW = 240;
            this.hpBarFill.width = (barW - 4) * pct;
            // 颜色按血量变化: 高=红, 中=黄, 低=橙
            if (pct > 0.6)      this.hpBarFill.fillColor = 0xdd2222;
            else if (pct > 0.3) this.hpBarFill.fillColor = 0xddaa22;
            else                this.hpBarFill.fillColor = 0xff6622;
        }
        this.hpText.setText(Math.ceil(this.hp) + ' / ' + this.maxHp);
        this.heartsText.setText((this.heartIcon ? 'x' : '\u2764x') + this.hearts);   // (用户) 图标模式只显 xN
    }

    /** 每帧调用 — 处理 5 秒死亡倒计时 */
    update(delta) {
        if (this.scene && this.scene._endingActive) return;   // (用户) 结局总闸
        // (用户) 回血特效跟随 + 过期隐藏
        if (this._healFx && this._healFx.scene) {
            const _p = this.scene.player;
            if (_p) { this._healFx.x = _p.x; this._healFx.y = _p.y; }
            if (this.scene.time.now > (this._healFxUntil || 0)) {
                this._healFx.setVisible(false);
                this._healFx.anims.stop();
            } else if (!this._healFx.anims.isPlaying) {
                this._healFx.play('healing_anim');
            }
        }
        // (用户) Shrine 区: 激活的 checkpoint 5 格 (160px) 内
        //   1) 快照: 每个 checkpoint 第一次进圈记录一次当前状态 (Save&Exit 后恢复到这份快照; 离开再回来不重记)
        //   2) 回血: 每秒 +5 HP / -1% 腐蚀 (Extreme 关闭回血, 快照不受影响)
        if (!this.isDead) {
            const _s = this.scene, _cp = _s._activeCheckpoint;
            if (_cp && _s.player && _s.player.body) {
                const _dx = _s.player.x - _cp.x, _dy = _s.player.y - _cp.y;
                const _inCp = (_dx * _dx + _dy * _dy <= 160 * 160);
                // (用户) 神像进圈快照已拆除 — 存档只发生于: ① 进入新图一次 ② 完全死亡 (FALLEN);
                //   神像只保留回血/降腐蚀功能
                const _cpd = (window.AbyssDiff ? AbyssDiff.get() : null);
                if (_inCp && (!_cpd || _cpd.cpRegen)) {
                    this._cpRegenAcc = (this._cpRegenAcc || 0) + delta;
                    if (this._cpRegenAcc >= 1000) {
                        this._cpRegenAcc -= 1000;
                        if (this.hp < this.maxHp) {
                            // (用户) 神像每秒 +5 滴血 — 不能用 heal(): 那是药水语义, heal(1) = 50% maxHp (≈50滴/秒)
                            this.hp = Math.min(this.maxHp, this.hp + 5);
                            this.playerHp = this.hp;
                            this.updateUI();
                            this.showHealFx();   // (用户) 神像持续回血 → 特效持续刷新
                        }
                        if (_s.diseaseSystem && _s.diseaseSystem.corrosionPct > 0) {
                            _s.diseaseSystem.corrosionPct = Math.max(0, _s.diseaseSystem.corrosionPct - 1);
                            if (_s.diseaseSystem._updateUI) _s.diseaseSystem._updateUI();
                        }
                    }
                } else this._cpRegenAcc = 0;
            }
        }
        if (!this.isDead) return;
        if (this.returningToHub) return;  // 永久死亡走的是 delayedCall
        if (this._deathAnimPlaying) return;  // 黑屏爱心动画期间不走倒计时 (动画完自己复活)
        this.deathCountdown -= delta;
        const sec = Math.max(1, Math.ceil(this.deathCountdown / 1000));
        this.deathText.setText('RESPAWNING IN ' + sec + '...');
        if (this.deathCountdown <= 0) this._doRespawnAtCheckpoint();
    }

    /** 旧 API: 不再有自动复活 (会扣 1 心然后回满 HP). 保留以防外部调用 */
    respawn() {
        // 旧调用入口 - 现在等同于 "重置到血满 + 爱心满 + 清侵蚀度"
        this.hp = this.maxHp;
        this.hearts = this.maxHearts;
        this.playerHp = this.hp;
        this.isDead = false;
        const s = this.scene;
        s.isDead = false;
        s.isPlayerStunned = false;
        // 玩家复活 → 侵蚀度完全清零
        if (s.diseaseSystem && s.diseaseSystem.reset) s.diseaseSystem.reset();
        if (s.player) {
            s.player.clearTint();
            s.player.setAlpha(1);
        }
        if (this.deathPanel) this.deathPanel.setVisible(false);
        this.updateUI();
    }
}