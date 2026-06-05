/**
 * Checkpoint — 神像存档点
 *
 * 大小：5格高×6格子宽 (160×192 px)
 * 状态：
 *   - unactivated（默认） → 单帧静态
 *   - activating → 20 帧激活动画
 *   - activated → 21 帧循环动画
 *
 * 玩家靠近 → 头顶 [E] 图标
 * 玩家按 E → 弹对话问"是否激活" → Yes 播激活动画 → activated
 * 已激活后再交互 → "你已经激活了这个存档点"
 */
class Checkpoint {
    constructor(scene, x, y, opts = {}) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.w = opts.w ?? (6 * 32);  // 激活后 6 格宽 = 192
        this.h = opts.h ?? (5 * 32);  // 激活后 5 格高 = 160
        this.unactivatedW = 3 * 32;   // 未激活 3 格宽 = 96
        this.unactivatedH = 4 * 32;   // 未激活 4 格高 = 128

        this.activated = false;

        // 选纹理：unactivated（单帧）— 显示 3×4 格
        const unactKey = 'Checkpoint_unactivated';
        const tex = scene.textures.exists(unactKey) ? unactKey : null;
        if (tex) {
            this.sprite = scene.add.sprite(x, y, tex);
            this.sprite.setDisplaySize(this.unactivatedW, this.unactivatedH);
        } else {
            this.sprite = scene.add.rectangle(x, y, this.unactivatedW, this.unactivatedH, 0x666688, 0.8);
            this.sprite.setStrokeStyle(2, 0xaaaaff);
        }
        this.sprite.setDepth(-3);

        // 注册动画
        if (scene.textures.exists('Checkpoint_activating') && !scene.anims.exists('checkpoint_activating')) {
            scene.anims.create({
                key: 'checkpoint_activating',
                frames: scene.anims.generateFrameNumbers('Checkpoint_activating', { start: 0, end: 21 }),
                frameRate: 12,
                repeat: 0
            });
        }
        if (scene.textures.exists('Checkpoint_activated') && !scene.anims.exists('checkpoint_activated')) {
            scene.anims.create({
                key: 'checkpoint_activated',
                frames: scene.anims.generateFrameNumbers('Checkpoint_activated', { start: 0, end: 20 }),
                frameRate: 12,
                repeat: -1
            });
        }

        // E 交互图标
        const iconTex = scene.textures.exists('Trader_interection_icon') ? 'Trader_interection_icon' : null;
        if (iconTex) {
            this.eIcon = scene.add.image(x, y - this.h / 2 - 20, iconTex);
            this.eIcon.setDepth(500).setVisible(false).setScale(1.0);
        } else {
            this.eIcon = scene.add.text(x, y - this.h / 2 - 20, '[E]', {
                fontSize: '20px', color: '#ffff66', fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 4
            }).setOrigin(0.5).setDepth(500).setVisible(false);
        }
    }

    setHintVisible(visible) {
        if (!this.eIcon) return;
        if (visible && !this._hintVisible) {
            this._hintVisible = true;
            this.eIcon.setVisible(true);
            this.eIcon.y = this.y - this.h / 2 - 20;
            this._eIconTween = this.scene.tweens.add({
                targets: this.eIcon,
                y: '-=10', duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
            });
        } else if (!visible && this._hintVisible) {
            this._hintVisible = false;
            this.eIcon.setVisible(false);
            this.scene.tweens.killTweensOf(this.eIcon);
            this._eIconTween = null;
        }
    }

    interact(player) {
        const scene = this.scene;
        if (this._activating) return;

        if (this._locked) {
            if (scene.dialogSystem && scene.dialogSystem.show) {
                scene.dialogSystem.show({
                    speaker: '???',
                    text: this._lockedMsg || 'Something blocks the shrine. Defeat the threat first.'
                });
            }
            return;
        }

        if (this.activated) {
            if (scene.dialogSystem && scene.dialogSystem.show) {
                scene.dialogSystem.show({
                    speaker: '???',
                    text: 'This shrine is already activated.'
                });
            }
            return;
        }

        if (!scene.dialogSystem || !scene.dialogSystem.show) {
            this._activate();
            return;
        }

        scene.dialogSystem.show({
            speaker: '???',
            text: 'Activate this checkpoint?',
            choices: [
                {
                    label: 'Yes',
                    action: () => {
                        scene.dialogSystem.close();
                        this._activate();
                    }
                },
                {
                    label: 'No',
                    action: () => scene.dialogSystem.close()
                }
            ]
        });
    }

    _activate() {
        this._activating = true;
        const scene = this.scene;
        // 注册 checkpoint guide (玩家可在 guide 里查看)
        if (scene.guideSystem && scene.guideSystem.registerGuide) {
            scene.guideSystem.registerGuide({
                id: 'checkpoint',
                title: 'Shrine',
                animType: 'checkpoint',
                captionText: 'Walk near a shrine to activate it. Stand within 5 cells to heal +1 HP and reduce corrosion -1% every second.'
            });
        }
        if (scene.anims.exists('checkpoint_activating')) {
            if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this.scene, 'CheckpointActivation');
            this.sprite.play('checkpoint_activating');
            // 切纹理后再设 displaySize（确保 6 格宽 5 格高）
            this.sprite.setDisplaySize(this.w, this.h);
            this.sprite.once('animationcomplete', () => {
                this._activating = false;
                this.activated = true;
                if (scene.anims.exists('checkpoint_activated')) {
                    this.sprite.play('checkpoint_activated');
                    this.sprite.setDisplaySize(this.w, this.h);
                }
                scene._activeCheckpoint = { x: this.x, y: this.y };
                // 触发 Yellow_dirt 皮肤扩散（zone2 镜头内）
                scene._yellowDirtSpread = {
                    cx: this.x,
                    cy: this.y,
                    radius: 0,
                    maxRadius: 1500,  // 够覆盖整个 zone2
                    active: true
                };
                if (scene.dialogSystem && scene.dialogSystem.show) {
                    scene.dialogSystem.show({
                        speaker: '???',
                        text: 'Checkpoint activated.'
                    });
                }
            });
        } else {
            this._activating = false;
            this.activated = true;
            scene._activeCheckpoint = { x: this.x, y: this.y };
        }
    }
}