/**
 * OpeningCinematicSystem — Tutorial 开场强制剧情
 *
 * 阶段设计（玩家全程无法操控）：
 *
 *   PHASE 0 (FALL): 自由落体
 *     - 镜头 zoom 2，对准玩家中心
 *     - vignette 渐显
 *     - 重力 0.4 倍（落地慢）
 *     - 持续直到玩家撞地
 *
 *   PHASE 1 (LYING_GETUP): 趴下 + 起身（共 3 秒）
 *     - 玩家立刻旋转 90°（趴下）
 *     - 0~3000ms 内缓慢 rotation 回 0（起身）
 *     - 镜头持续对准玩家
 *
 *   PHASE 2 (FIRST_LINE): 第一句对话（玩家镜头）
 *     - vignette 淡出
 *     - 字幕弹出："???: Hmm? Another one fell down?"
 *     - 等用户点击/SPACE 推进
 *
 *   PHASE 3 (PAN_TO_MOLE): 镜头平移到商人 + 商人说一句
 *     - cam.pan(mole.x, mole.y, 1500ms)
 *     - 镜头到位后字幕：???: "You don't smell like the missing miners..."
 *     - 等用户推进
 *
 *   PHASE 4 (PAN_TO_MIDDLE): 镜头平移到中间 + zoom 小一点
 *     - cam.pan(midX, midY, 1500ms)
 *     - cam.zoomTo(1.4)（看到两人）
 *     - 然后开始长对话
 *
 *   PHASE 5 (DONE): 解锁玩家
 */
class OpeningCinematicSystem {
    constructor(scene) {
        this.scene = scene;
        this.phase = 0;
        this.lyingStartTime = 0;
        this.vignette = null;
        this._origGravity = null;
        this._origBounds = null;
        this._moleNameTag = null;
    }

    start() {
        const s = this.scene;
        const cam = s.cameras.main;
        // console.log('[Cinematic] start at player', s.player?.x, s.player?.y);   // (用户) 诊断日志静默

        s._cinematicLock = true;
        this.phase = 0;

        // 隐藏 HUD（除设定按钮）
        if (s.hudSystem && s.hudSystem.setHUDVisible) s.hudSystem.setHUDVisible(false);

        // 玩家
        if (s.player && s.player.body) {
            s.player.body.setVelocity(0, 0);
            this._origGravity = s.physics.world.gravity.y;
            s.physics.world.gravity.y = this._origGravity * 0.4;
        }

        // 镜头
        this._origBounds = {
            x: cam._bounds.x, y: cam._bounds.y,
            width: cam._bounds.width, height: cam._bounds.height
        };
        // 一楼 bounds 限制（y 最多到 39 行）
        cam.removeBounds();
        cam.stopFollow();
        cam.zoomTo(4, 1500, 'Power2', true);
        cam.centerOn(23 * 32 + 16, 36 * 32 + 16);  // 对准 (col 23, row 36) 中心
        cam.startFollow(s.player, true, 0.15, 0.15);

        // vignette
        this._createVignette();
        if (this.vignette) {
            this.vignette.alpha = 0;
            s.tweens.add({
                targets: this.vignette,
                alpha: 1,
                duration: 1500,
                ease: 'Power2'
            });
        }
    }

    _createVignette() {
        const s = this.scene;
        const W = s.cameras.main.width;
        const H = s.cameras.main.height;
        const gfx = s.add.graphics();
        gfx.setScrollFactor(0).setDepth(820);

        const LAYERS = 24;
        const maxInset = W * 0.30;
        for (let i = 0; i < LAYERS; i++) {
            const t = i / (LAYERS - 1);
            const a = (1 - t) * (1 - t) * 0.12;
            const inset = t * maxInset;
            const bandThickness = (W * 0.025);
            gfx.fillStyle(0x000000, a);
            gfx.fillRect(0, inset, W, bandThickness);
            gfx.fillRect(0, H - inset - bandThickness, W, bandThickness);
            gfx.fillRect(inset, 0, bandThickness, H);
            gfx.fillRect(W - inset - bandThickness, 0, bandThickness, H);
        }
        this.vignette = gfx;
        try { s.cameras.main.ignore(this.vignette); } catch(e) {}
    }

    update(time, delta) {
        const s = this.scene;
        if (this.phase >= 5) return;
        if (!s.player || !s.player.body) return;

        // 锁定玩家 X 速度
        s.player.body.setVelocityX(0);

        // === PHASE 0: 自由落体 ===
        if (this.phase === 0) {
            // 落地条件：撞到 y=37 格子前 1px（player.body.bottom >= 1183）
            const targetGroundTop = 37 * 32;  // 1184
            const targetBottom = targetGroundTop - 1;  // 1183
            if (s.player.body.bottom >= targetBottom) {
                // console.log('[Cinematic] phase 0 → 1 (landed at row 37 - 1px)');   // (用户) 诊断日志静默
                this.phase = 1;
                this.lyingStartTime = time;
                if (this._origGravity != null) {
                    s.physics.world.gravity.y = this._origGravity;
                }
                // 传送到精确位置 — body.bottom = 1183
                const bodyH = s.player.body.height;
                s.player.body.reset(s.player.x, targetBottom - bodyH);
                s.player.body.setVelocity(0, 0);
                s.player.setRotation(0);
                // 起身动画 — sprite 显示整体往下 16px (origin.y = 0.302)，结束后 tween 平滑上升到 idle
                if (s.anims.exists('stand_up')) {
                    try {
                        s.player.setOrigin(0.5, 0.578);  // sprite 显示上移 16px
                        s.player.play('stand_up');
                        s.player.once('animationcomplete-stand_up', () => {
                            // 平滑过渡 origin → 0.5（避免瞬移）
                            s.tweens.add({
                                targets: s.player,
                                originY: 0.5,
                                duration: 400,
                                ease: 'Cubic.easeOut',
                                onComplete: () => {
                                    if (s.anims.exists('idle')) {
                                        try { s.player.play('idle'); } catch(e) {}
                                    }
                                }
                            });
                        });
                    } catch(e) {}
                } else if (s.anims.exists('idle')) {
                    try { s.player.play('idle'); } catch(e) {}
                }
            }
            return;
        }

        // === PHASE 1: 趴 + 起身 3 秒 ===
        if (this.phase === 1) {
            const elapsed = time - this.lyingStartTime;
            if (elapsed > 4000) {
                // console.log('[Cinematic] phase 1 → 2 (first line)');   // (用户) 诊断日志静默
                this.phase = 2;
                this._showFirstLine();
            }
            return;
        }

        // PHASE 2/3/4 由对话推进决定切换，update 不做事
    }

    /** PHASE 2：第一句字幕 */
    _showFirstLine() {
        const s = this.scene;

        // vignette 淡出（不要遮对话框）
        if (this.vignette) {
            s.tweens.add({
                targets: this.vignette,
                alpha: 0,
                duration: 800,
                ease: 'Power2',
                onComplete: () => {
                    if (this.vignette) {
                        this.vignette.destroy();
                        this.vignette = null;
                    }
                }
            });
        }

        if (!s.dialogSystem) {
            this._goPhase3();
            return;
        }
        // 用 dialog show + 等用户推进
        s.dialogSystem.show({
            speaker: '???',
            text: 'Hmm? Another one fell down?'
        });
        // 监听对话关闭后切下一阶段
        this._waitDialogClose(() => this._goPhase3());
    }

    /** 等当前对话关闭后调 cb */
    _waitDialogClose(cb) {
        const s = this.scene;
        const check = () => {
            if (!s.dialogSystem || !s.dialogSystem.isOpen) {
                cb();
            } else {
                s.time.delayedCall(100, check);
            }
        };
        s.time.delayedCall(150, check);
    }

    /** PHASE 3：镜头到商人 + 商人说一句 */
    _goPhase3() {
        const s = this.scene;
        // console.log('[Cinematic] phase 2 → 3 (pan to mole)');   // (用户) 诊断日志静默
        this.phase = 3;

        if (!s.moleTrader) {
            this._goPhase4();
            return;
        }

        // 镜头停止跟随玩家，平移到商人
        s.cameras.main.stopFollow();
        s.cameras.main.pan(s.moleTrader.x, s.moleTrader.y, 1500, 'Power2');

        // 商人头上 ??? 名牌
        this._showMoleNameTag('???');

        // 1500ms 后镜头到位 → 弹字幕
        s.time.delayedCall(1600, () => {
            if (!s.dialogSystem) {
                this._goPhase4();
                return;
            }
            s.dialogSystem.show({
                speaker: '???',
                text: "You don't seem like you gone bad yet. Unlike the others..."
            });
            this._waitDialogClose(() => this._goPhase4());
        });
    }

    /** PHASE 4：镜头到中间 + 长对话 */
    _goPhase4() {
        const s = this.scene;
        // console.log('[Cinematic] phase 3 → 4 (pan to middle, long dialog)');   // (用户) 诊断日志静默
        this.phase = 4;

        if (!s.player || !s.moleTrader) {
            this._finish();
            return;
        }

        const midX = (s.player.x + s.moleTrader.x) / 2;
        const midY = (s.player.y + s.moleTrader.y) / 2;

        // 镜头平移 + zoom 缩小（看到两人）
        s.cameras.main.pan(midX, midY, 1500, 'Power2');
        s.cameras.main.zoomTo(3, 1500, 'Power2', true);

        // 1500ms 后开始长对话
        s.time.delayedCall(1600, () => this._startLongDialog());
    }

    _startLongDialog() {
        const s = this.scene;
        if (!s.dialogSystem) {
            this._finish();
            return;
        }

        const sequence = [
            { speaker: 'You', text: 'Wh- who are you!?' },
            {
                speaker: '???',
                text: "Whoa, easy there. The Name's Whisker. Been living down here a long time.",
                onShow: () => {
                    if (this._moleNameTag) {
                        this._moleNameTag.setText('Whisker');
                        this._moleNameTag.setColor('#88ff88');
                    }
                }
            },
            { speaker: 'Whisker', text: "I'm just a wandering trader. whatever rare things you bring here from the surface, I'll bargain." },
            { speaker: 'Whisker', text: 'I have an interesting feel about you, kido. Bet ya came down for those things too, didn\'t you?' },
            {
                speaker: 'Whisker',
                text: "Anyways, profit's all I care about. I can help you but only in my terms.",
                choices: [
                    { label: "What do you mean by 'those things'?", action: () => this._showClue(1) },
                    { label: "No, I'm just passing through.",       action: () => this._showClue(2) }
                ]
            }
        ];

        this._playSequence(sequence, () => {
            // 普通序列结束（如果中途没分支到 _showClue）
            // 由 _showClue 调 _finish
        });
    }

    /** 播放对话序列（支持 onShow） */
    _playSequence(seq, onComplete) {
        const s = this.scene;
        let idx = 0;
        const next = () => {
            if (idx >= seq.length) {
                if (onComplete) onComplete();
                return;
            }
            const entry = seq[idx];
            idx++;
            if (entry.onShow) entry.onShow();

            if (entry.choices) {
                // 有选项的对话：show + 等选项点击
                s.dialogSystem.show(entry);
                return;  // 不继续 next，等选项 action 处理
            }
            // 普通对话
            s.dialogSystem.show({ speaker: entry.speaker, text: entry.text });
            this._waitDialogClose(next);
        };
        next();
    }

    _showClue(clueIdx) {
        const s = this.scene;
        s.dialogSystem.close();

        let sequence;
        if (clueIdx === 1) {
            sequence = [
                { speaker: 'Whisker', text: "Go deeper and you'll see. They're not just your usual crystals." },
                { speaker: 'Whisker', text: 'They wait... they grow... down at the center of it all.' },
                { speaker: 'Whisker', text: 'Stay alive. I only deal with the living.' }
            ];
        } else {
            sequence = [
                { speaker: 'Whisker', text: "Don't pretend. People don't 'pass through' here." },
                { speaker: 'Whisker', text: 'I know what you want.' },
                { speaker: 'Whisker', text: "Go deeper and you'll see. They're not just your usual crystals." },
                { speaker: 'Whisker', text: 'They wait... they grow... down at the center of it all.' },
                { speaker: 'Whisker', text: 'Stay alive. I only deal with the living.' }
            ];
        }
        this._playSequence(sequence, () => this._finish());
    }

    /** 结束 cinematic：商人钻地 → 重生在 (56, 11) → 恢复镜头 → 解锁 */
    _finish() {
        const s = this.scene;
        // console.log('[Cinematic] FINISH start - mole burrows');   // (用户) 诊断日志静默
        this.phase = 5;

        // 关掉对话框
        if (s.dialogSystem && s.dialogSystem.isOpen) {
            s.dialogSystem.close();
        }

        // 1. 商人钻地动画
        if (s.moleTrader) {
            // 先把商人显示优先级降到方块以下（让它视觉上"下沉到地里"）
            s.moleTrader.setDepth(-30);
            // 名牌也淡出
            if (this._moleNameTag) {
                s.tweens.add({
                    targets: this._moleNameTag,
                    alpha: 0,
                    duration: 600,
                    onComplete: () => {
                        if (this._moleNameTag) this._moleNameTag.destroy();
                        this._moleNameTag = null;
                    }
                });
            }
            // 播放钻地动画 2 秒，中心偏移（左 32, 上 32），完成后商人 teleport
            const origX = s.moleTrader.x;
            const origY = s.moleTrader.y;
            const origDisplayW = s.moleTrader.displayWidth;
            const origDisplayH = s.moleTrader.displayHeight;
            if (s.anims.exists('trader_dig') && s.moleTrader.play) {
                s.moleTrader.setPosition(origX, origY - 32);   // (用户) 钻地动画微调终值: 右移 32px、净上移 0px (+16/-8 ×2, 再下移 16)
                // dig 帧是 64×64，缩小到 48×48 显示
                s.moleTrader.setDisplaySize(48, 48);
                s.moleTrader.play('trader_dig');
                // (修复) 钻地音效 — Tutorial 商人钻地之前漏了 MoleDig (SZ2/SZ3 都有, 全局缓存已加载). 循环播, 2s 后 teleport 时停
                if (typeof AudioSystem !== 'undefined' && s.cache && s.cache.audio && s.cache.audio.exists('MoleDig')) {
                    try {
                        if (s._tutMoleDigSnd) { try { s._tutMoleDigSnd.stop(); s._tutMoleDigSnd.destroy(); } catch (e2) {} s._tutMoleDigSnd = null; }
                        s._tutMoleDigSnd = s.sound.add('MoleDig', { volume: AudioSystem.sfxVolume, loop: true });
                        s._tutMoleDigSnd.play();
                    } catch (e) { s._tutMoleDigSnd = null; }
                }
            }
            s.time.delayedCall(2000, () => {
                // (修复) 停钻地音效
                if (s._tutMoleDigSnd) { try { s._tutMoleDigSnd.stop(); s._tutMoleDigSnd.destroy(); } catch (e) {} s._tutMoleDigSnd = null; }
                // 商人 teleport 到二楼 (56, 11)
                const newX = (56 + 0.5) * 32;
                const newY = (11 + 0.5) * 32;
                s.moleTrader.setPosition(newX, newY);
                // 先切回 stand 纹理 + scale 1（不用 setDisplaySize 因为它改 scale）
                s.moleTrader.setTexture('Trader_stand');
                s.moleTrader.setScale(1);
                s.moleTrader.setAlpha(1);
                s.moleTrader.setDepth(10);
                if (s.moleTrader.body) s.moleTrader.body.reset(newX, newY);
                if (s.anims.exists('trader_stand') && s.moleTrader.play) {
                    s.moleTrader.play('trader_stand');
                }
                // console.log('[Cinematic] mole respawned at (56, 11)');   // (用户) 诊断日志静默

                this._restoreCameraAndUnlock();
            });
        } else {
            this._restoreCameraAndUnlock();
        }
    }

    _restoreCameraAndUnlock() {
        const s = this.scene;
        if (this._origBounds && s.cameras.main) {
            s.cameras.main.setBounds(
                this._origBounds.x, this._origBounds.y,
                this._origBounds.width, this._origBounds.height
            );
        }
        s.cameras.main.zoomTo(2, 1000, 'Power2', true);
        s.cameras.main.startFollow(s.player, true, 0.1, 0.1);
        s._currentChunkId = null;
        s._cinematicLock = false;
        // 恢复 HUD
        if (s.hudSystem && s.hudSystem.setHUDVisible) s.hudSystem.setHUDVisible(true);
        // console.log('[Cinematic] unlocked');   // (用户) 诊断日志静默
    }

    /** 商人头上名牌 */
    _showMoleNameTag(name) {
        const s = this.scene;
        if (!s.moleTrader) return;
        if (this._moleNameTag) {
            this._moleNameTag.setText(name);
            return;
        }
        this._moleNameTag = s.add.text(s.moleTrader.x, s.moleTrader.y - 60, name, {
            fontSize: '20px', color: '#ffcc55', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5).setDepth(500);

        if (s.uiCam) {
            try { s.uiCam.ignore(this._moleNameTag); } catch(e) {}
        }
    }

    // ════════════════════════════════════════════════
    // 水晶门后剧情（玩家挖水晶任务发布）
    // ════════════════════════════════════════════════

    startCrystalDoorPlot() {
        const s = this.scene;
        if (this._crystalDoorPlotPlaying) return;
        this._crystalDoorPlotPlaying = true;
        // console.log('[Cinematic] crystal door plot start');   // (用户) 诊断日志静默

        s._cinematicLock = true;
        // 隐藏 HUD
        if (s.hudSystem && s.hudSystem.setHUDVisible) s.hudSystem.setHUDVisible(false);

        // 玩家强制 idle 动画 + 速度归零
        if (s.player && s.player.body) {
            s.player.body.setVelocity(0, 0);
            if (s.anims.exists('idle')) {
                try { s.player.play('idle'); } catch(e) {}
            }
        }

        // 临时取消 bounds，强制对准目标
        const cam = s.cameras.main;
        if (!this._origBounds || !this._origBounds.width) {
            this._origBounds = {
                x: cam._bounds.x, y: cam._bounds.y,
                width: cam._bounds.width, height: cam._bounds.height
            };
        }
        cam.removeBounds();
        cam.stopFollow();

        // 玩家 x 速度归零
        if (s.player && s.player.body) s.player.body.setVelocityX(0);

        // 镜头平移到商人 + zoom 0.3
        if (s.moleTrader) {
            cam.pan(s.moleTrader.x, s.moleTrader.y, 1500, 'Power2');
        }
        cam.zoomTo(4, 1500, 'Power2', true);

        // 1500ms 后开始对话
        s.time.delayedCall(1600, () => this._cdpDialog1());
    }

    _cdpDialog1() {
        const s = this.scene;
        if (!s.dialogSystem) { this._cdpFinish(); return; }

        const sequence = [
            { speaker: 'Whisker', text: "Knew I wasn't wrong about you, kid. You've got real potential." },
            { speaker: 'Whisker', text: 'See those crystals over there?' }
        ];
        this._playSequence(sequence, () => this._cdpPanToCrystal());
    }

    _cdpPanToCrystal() {
        const s = this.scene;
        const cam = s.cameras.main;
        // 镜头切到水晶矿 (46, 11) — 渲染坐标
        const crystalX = 46.5 * 32;
        const crystalY = 11.5 * 32;
        cam.pan(crystalX, crystalY, 1500, 'Power2');

        s.time.delayedCall(1600, () => {
            // 在水晶位置说一句
            s.dialogSystem.show({
                speaker: 'Whisker',
                text: 'Mine and bring them to me.'
            });
            this._waitDialogClose(() => this._cdpPanBackToMole());
        });
    }

    _cdpPanBackToMole() {
        const s = this.scene;
        const cam = s.cameras.main;
        if (s.moleTrader) {
            cam.pan(s.moleTrader.x, s.moleTrader.y, 1500, 'Power2');
        }

        s.time.delayedCall(1600, () => {
            s.dialogSystem.show({
                speaker: 'Whisker',
                text: "Do that, and I'll give you what you need. Deal?"
            });
            this._waitDialogClose(() => this._cdpFinish());
        });
    }

    _cdpFinish() {
        const s = this.scene;
        const cam = s.cameras.main;
        // console.log('[Cinematic] crystal door plot finish');   // (用户) 诊断日志静默

        // 恢复
        if (this._origBounds && this._origBounds.width) {
            cam.setBounds(
                this._origBounds.x, this._origBounds.y,
                this._origBounds.width, this._origBounds.height
            );
        }
        cam.zoomTo(2, 1000, 'Power2', true);
        cam.startFollow(s.player, true, 0.1, 0.1);
        // 重置 chunkCamera 状态
        s._currentChunkId = null;
        s._cinematicLock = false;
        this._crystalDoorPlotPlaying = false;

        s._crystalQuestActive = true;
        // 恢复 HUD
        if (s.hudSystem && s.hudSystem.setHUDVisible) s.hudSystem.setHUDVisible(true);

        // 注册水晶挖掘 guide（这个 guide 在剧情之前不存在）
        if (s.guideSystem && s.guideSystem.registerGuide) {
            s.guideSystem.registerGuide({
                id: 'mining',
                title: 'Mining Crystals',
                animType: 'mine',
                captionText: 'Walk to a crystal, click to attack 3 times, then walk over to pick it up.'
            });
        }
    }

    // ════════════════════════════════════════════════
    // 买钥匙后剧情（指引玩家去 SecretDoor）
    // ════════════════════════════════════════════════

    startKeyPlot() {
        const s = this.scene;
        if (this._keyPlotPlaying) return;
        this._keyPlotPlaying = true;
        // console.log('[Cinematic] key plot start');   // (用户) 诊断日志静默

        s._cinematicLock = true;
        // 隐藏 HUD
        if (s.hudSystem && s.hudSystem.setHUDVisible) s.hudSystem.setHUDVisible(false);

        // 玩家强制 idle
        if (s.player && s.player.body) {
            s.player.body.setVelocity(0, 0);
            if (s.anims.exists('idle')) {
                try { s.player.play('idle'); } catch(e) {}
            }
        }

        const cam = s.cameras.main;
        if (!this._origBounds || !this._origBounds.width) {
            this._origBounds = {
                x: cam._bounds.x, y: cam._bounds.y,
                width: cam._bounds.width, height: cam._bounds.height
            };
        }
        cam.removeBounds();
        cam.stopFollow();

        // 镜头到商人 + zoom 0.3
        if (s.moleTrader) {
            cam.pan(s.moleTrader.x, s.moleTrader.y, 1500, 'Power2');
        }
        cam.zoomTo(4, 1500, 'Power2', true);

        s.time.delayedCall(1600, () => this._kpDialog1());
    }

    _kpDialog1() {
        const s = this.scene;
        const seq = [
            { speaker: 'Whisker', text: 'Good work, kid.' },
            { speaker: 'Whisker', text: 'See that door up ahead?' }
        ];
        this._playSequence(seq, () => this._kpPanToDoor());
    }

    _kpPanToDoor() {
        const s = this.scene;
        const cam = s.cameras.main;
        // 镜头切到 (33, 11) — 渲染坐标
        cam.pan(33.5 * 32, 11.5 * 32, 1500, 'Power2');
        s.time.delayedCall(1600, () => {
            s.dialogSystem.show({
                speaker: 'Whisker',
                text: 'Use the key in your hand to open it.'
            });
            this._waitDialogClose(() => this._kpPanBack());
        });
    }

    _kpPanBack() {
        const s = this.scene;
        const cam = s.cameras.main;
        if (s.moleTrader) {
            cam.pan(s.moleTrader.x, s.moleTrader.y, 1500, 'Power2');
        }
        s.time.delayedCall(1600, () => {
            const seq = [
                { speaker: 'Whisker', text: "It's the only way out for you." },
                { speaker: 'Whisker', text: "Now go and good luck, you'll need it." }
            ];
            this._playSequence(seq, () => this._kpFinish());
        });
    }

    _kpFinish() {
        const s = this.scene;
        const cam = s.cameras.main;
        // console.log('[Cinematic] key plot finish');   // (用户) 诊断日志静默
        if (this._origBounds && this._origBounds.width) {
            cam.setBounds(
                this._origBounds.x, this._origBounds.y,
                this._origBounds.width, this._origBounds.height
            );
        }
        cam.zoomTo(2, 1000, 'Power2', true);
        cam.startFollow(s.player, true, 0.1, 0.1);
        s._currentChunkId = null;
        s._cinematicLock = false;
        this._keyPlotPlaying = false;

        s._keyPlotDone = true;
        // 恢复 HUD
        if (s.hudSystem && s.hudSystem.setHUDVisible) s.hudSystem.setHUDVisible(true);
    }
}