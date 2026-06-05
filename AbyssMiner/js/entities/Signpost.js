/**
 * Signpost — 告示牌
 *
 * 行为：
 *   - 在世界放置一个小图标（2 格高 1 格宽，位置 (col, row1) ~ (col, row2)）
 *   - 不挡玩家（无物理）
 *   - 玩家靠近 → 头顶出现 [E] 图标
 *   - 按 E → 屏幕中央显示一张大告示牌图，显示文本
 *   - 玩家按任意键 → 关闭告示牌
 *
 * 显示层级：
 *   image depth = -3
 *   E icon depth = 500
 *   告示牌全屏面板 depth = 940
 */
class Signpost {
    constructor(scene, x, y, opts = {}) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.w = opts.w ?? 32;
        this.h = opts.h ?? 32;
        this.text = opts.text ?? 'You should not be here.';

        // 视觉：用 Signpost 图（如果有），否则 fallback 木色矩形
        if (scene.textures.exists('Signpost')) {
            this.image = scene.add.image(x, y, 'Signpost');
            this.image.setDisplaySize(this.w, this.h);
        } else {
            this.image = scene.add.rectangle(x, y, this.w, this.h, 0x886633, 1);
            this.image.setStrokeStyle(2, 0x442200);
        }
        this.image.setDepth(-3);

        // E 图标
        if (scene.textures.exists('Trader_interection_icon')) {
            this.eIcon = scene.add.image(x, y - this.h / 2 - 20, 'Trader_interection_icon');
            this.eIcon.setDepth(500).setVisible(false);
        } else {
            this.eIcon = scene.add.text(x, y - this.h / 2 - 20, '[E]', {
                fontSize: '20px', color: '#ffff66', fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 4
            }).setOrigin(0.5).setDepth(500).setVisible(false);
        }

        // 告示牌全屏面板（互动时显示）
        this._panelOpen = false;
        this._panel = null;

        // 让 uiCam ignore（image 和 eIcon 跟相机滚动）
        if (scene.uiCam) {
            try {
                scene.uiCam.ignore(this.image);
                scene.uiCam.ignore(this.eIcon);
            } catch(e) {}
        }
    }

    isPlayerNear(player) {
        if (!player) return false;
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        return Math.abs(dx) < this.w / 2 + 16 && Math.abs(dy) < this.h / 2 + 16;
    }

    setHintVisible(v) {
        if (!this.eIcon) return;
        if (v && !this._hintVisible) {
            this._hintVisible = true;
            this.eIcon.setVisible(true);
            // 重置 y 到原位
            this.eIcon.y = this._eIconBaseY ?? (this.y - this.h / 2 - 20);
            this._eIconBaseY = this.eIcon.y;
            // 上下浮动 tween
            this._eIconTween = this.scene.tweens.add({
                targets: this.eIcon,
                y: '-=10',
                duration: 600,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        } else if (!v && this._hintVisible) {
            this._hintVisible = false;
            this.eIcon.setVisible(false);
            this.scene.tweens.killTweensOf(this.eIcon);
            this._eIconTween = null;
        }
    }

    interact(player) {
        if (this._panelOpen) return;
        const s = this.scene;
        if (!s.dialogSystem) return;
        this._panelOpen = true;
        s._signpostOpen = true;
        s.dialogSystem.showSequence([
            { speaker: 'Signpost', text: this.text }
        ], () => {
            this._panelOpen = false;
            s._signpostOpen = false;
        });
    }

    _showPanel() {
        // 已废弃，改用 DialogSystem
        this.interact();
    }

    _closePanel() {
        const s = this.scene;
        if (!this._panelOpen) return;
        this._panelOpen = false;
        s._signpostOpen = false;

        if (this._panel) {
            this._panel.destroy();
            this._panel = null;
        }
        // 移除 listener
        if (this._closeHandler) {
            s.input.keyboard.off('keydown', this._closeHandler);
            s.input.off('pointerdown', this._closeHandler);
            this._closeHandler = null;
        }
    }

    destroy() {
        if (this.image) this.image.destroy();
        if (this.eIcon) this.eIcon.destroy();
        if (this._panel) this._panel.destroy();
    }
}