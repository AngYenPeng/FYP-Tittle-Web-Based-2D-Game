/**
 * Hint - 互动提示
 * 参考 Checkpoint eIcon 实现 — image + tween 上下浮动, depth 500
 */
class Hint {
    constructor(scene, col, row, options = {}) {
        this.scene = scene;
        const G = 32;
        this.x = col * G + G / 2 - 5;  // 往左偏 5px
        this.y = row * G + G / 2 + (options.yOffset || 0);  // 可选 y 偏移
        this.onInteract = options.onInteract || (() => {});
        this.interactRange = options.interactRange || ((typeof InteractSystem !== 'undefined' && InteractSystem.RANGE) || 80);   // (用户) 全游戏统一交互距离
        this._achId = options.achId || null;   // (用户成就) 交互即解锁的成就 id
        this.hasInteracted = false;
        this._isOpen = false;
        this._hintVisible = false;
        this._eIconTween = null;

        // E 图标 — 优先 Hint spritesheet, fallback 神像 E icon, 最后 text
        if (scene.textures.exists('Hint')) {
            if (!scene.anims.exists('hint_bounce')) {
                scene.anims.create({
                    key: 'hint_bounce',
                    frames: scene.anims.generateFrameNumbers('Hint', { start: 0, end: 6 }),
                    frameRate: 10,
                    repeat: -1
                });
            }
            this.sprite = scene.add.sprite(this.x, this.y - 39, 'Hint', 0);
            this.sprite.setDepth(500);
            this.sprite.play('hint_bounce');
        } else if (scene.textures.exists('Trader_interection_icon')) {
            this.sprite = scene.add.image(this.x, this.y - 39, 'Trader_interection_icon');
            this.sprite.setDepth(500);
        } else {
            this.sprite = scene.add.text(this.x, this.y - 39, '[E]', {
                fontSize: '20px', color: '#ffff66', fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 4
            }).setOrigin(0.5).setDepth(500);
        }
        this.sprite.setVisible(false);

        if (scene.uiCam) {
            try { scene.uiCam.ignore(this.sprite); } catch(e) {}
        }

        if (!scene._hints) scene._hints = [];
        scene._hints.push(this);
    }

    _showHint() {
        if (this._hintVisible) return;
        this._hintVisible = true;
        this.sprite.setVisible(true);
        this.sprite.y = this.y - 39;
        this._eIconTween = this.scene.tweens.add({
            targets: this.sprite,
            y: '-=10', duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
    }

    _hideHint() {
        if (!this._hintVisible) return;
        this._hintVisible = false;
        this.sprite.setVisible(false);
        if (this._eIconTween) {
            this.scene.tweens.killTweensOf(this.sprite);
            this._eIconTween = null;
        }
    }

    update() {
        if (!this.scene.player || !this.scene.player.body) return;
        const dx = this.scene.player.x - this.x;
        const dy = this.scene.player.y - this.y;
        const inRange = (dx*dx + dy*dy) < this.interactRange * this.interactRange;

        if (inRange) this._showHint();
        else this._hideHint();

        if (inRange && !this._isOpen && this.scene.keyE && Phaser.Input.Keyboard.JustDown(this.scene.keyE)) {
            if (this._achId && typeof AchievementSystem !== 'undefined') AchievementSystem.unlock(this.scene, this._achId);   // (用户成就)
            this._isOpen = true;
            const firstTime = !this.hasInteracted;
            this.hasInteracted = true;
            try {
                this.onInteract(firstTime);
            } catch(e) {
                console.error('Hint.onInteract error:', e);
            }
            this.scene.time.delayedCall(150, () => { this._isOpen = false; });
        }
    }

    destroy() {
        if (this._eIconTween) this.scene.tweens.killTweensOf(this.sprite);
        if (this.sprite && this.sprite.destroy) this.sprite.destroy();
        if (this.scene._hints) {
            const i = this.scene._hints.indexOf(this);
            if (i >= 0) this.scene._hints.splice(i, 1);
        }
    }
}