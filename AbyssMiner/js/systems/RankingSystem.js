/**
 * RankingSystem — 游戏结束结算 + 排行榜
 * 根据玩家身上的水晶数量打分
 */
class RankingSystem {
    constructor(scene) {
        this.scene = scene;
        this.isOpen = false;
    }

    show(crystalCount) {
        if (this.isOpen) return;
        this.isOpen = true;

        const cam = this.scene.cameras.main;
        const W = cam.width;
        const H = cam.height;

        // 全屏遮罩
        this._overlay = this.scene.add.rectangle(W/2, H/2, W, H, 0x000000, 0.85)
            .setScrollFactor(0).setDepth(2000);

        // Title
        this._title = this.scene.add.text(W/2, H * 0.18, 'YOU SAVED THE CAVE', {
            fontSize: '40px', color: '#66ccff', fontStyle: 'bold',
            stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

        this._subtitle = this.scene.add.text(W/2, H * 0.27,
            'The Spider Queen has been slain. The infection ends with her.',
            { fontSize: '18px', color: '#aaa', fontStyle: 'italic' }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

        // 评级
        let grade, gradeColor, comment;
        if (crystalCount >= 100) { grade = 'S'; gradeColor = '#ffcc44'; comment = 'Legendary harvest!'; }
        else if (crystalCount >= 60) { grade = 'A'; gradeColor = '#88dd66'; comment = 'Excellent work!'; }
        else if (crystalCount >= 30) { grade = 'B'; gradeColor = '#66aaff'; comment = 'Solid haul.'; }
        else if (crystalCount >= 10) { grade = 'C'; gradeColor = '#cccccc'; comment = 'Just scraped by.'; }
        else { grade = 'D'; gradeColor = '#aa6666'; comment = 'You barely made it out.'; }

        this._gradeLabel = this.scene.add.text(W/2 - 80, H/2 + 20, 'RANK', {
            fontSize: '20px', color: '#888'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

        this._grade = this.scene.add.text(W/2 + 40, H/2 + 30, grade, {
            fontSize: '120px', color: gradeColor, fontStyle: 'bold',
            stroke: '#000', strokeThickness: 6
        }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

        // 水晶数
        this._crystalLine = this.scene.add.text(W/2, H * 0.7,
            `Crystals collected: ${crystalCount}`,
            { fontSize: '24px', color: '#ffffff' }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

        this._commentLine = this.scene.add.text(W/2, H * 0.77,
            comment, { fontSize: '18px', color: '#aaaaaa', fontStyle: 'italic' }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

        // 返回主菜单 button
        this._restart = this.scene.add.text(W/2, H * 0.9, '[ Click to return to Title ]', {
            fontSize: '20px', color: '#ffff66', fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(2001).setInteractive();
        this._restart.on('pointerdown', () => {
            this.scene.scene.start('TitleScene');
        });

        // 让所有元素被 uiCam 渲染（如果存在）
        if (this.scene.uiCam) {
            const els = [this._overlay, this._title, this._subtitle, this._gradeLabel, this._grade, this._crystalLine, this._commentLine, this._restart];
            try { this.scene.cameras.main.ignore(els); } catch(e) {}
        }
    }
}