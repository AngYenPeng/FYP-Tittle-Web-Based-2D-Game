/**
 * StorySign — 故事告示牌（精灵族残骸 / 旧标记等）
 * 玩家靠近 → 显示 E icon → 按 E 触发 DialogSystem
 */
class StorySign {
    constructor(scene, x, y, options = {}) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.lines = options.lines || ['...'];
        this.speaker = options.speaker || '???';
        this.style = options.style || 'remains';  // remains / scroll / stone

        // 视觉
        const w = options.w || 32;
        const h = options.h || 32;
        let color = 0x666666;
        if (this.style === 'remains') color = 0xaa6633;
        else if (this.style === 'scroll') color = 0xddcc88;
        else if (this.style === 'stone') color = 0x888888;
        this.rect = scene.add.rectangle(x, y, w, h, color).setStrokeStyle(2, 0x222222).setDepth(5);
        // 标记 icon (?)
        this.icon = scene.add.text(x, y - h/2 - 8, '?', {
            fontSize: '14px', color: '#ffff44', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(6);

        // E icon (默认隐藏)
        this.eIcon = scene.add.text(x, y - h/2 - 22, 'E', {
            fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
            backgroundColor: '#222'
        }).setOrigin(0.5).setPadding(4, 2, 4, 2).setDepth(7).setVisible(false);

        if (scene.uiCam) {
            try { scene.uiCam.ignore([this.rect, this.icon, this.eIcon]); } catch(e) {}
        }

        this._used = false;
        if (!scene._storySigns) scene._storySigns = [];
        scene._storySigns.push(this);
    }

    update() {
        if (!this.scene.player) return;
        const dx = this.scene.player.x - this.x;
        const dy = this.scene.player.y - this.y;
        const near = dx*dx + dy*dy < 60*60;
        this.eIcon.setVisible(near);
        if (near && this.scene.keyE && Phaser.Input.Keyboard.JustDown(this.scene.keyE)) {
            this.interact();
        }
    }

    interact() {
        if (!this.scene.dialogSystem) return;
        const seq = this.lines.map(text => ({ speaker: this.speaker, text }));
        this.scene.dialogSystem.show(seq);
    }
}