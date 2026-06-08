/**
 * Mole Trader (鼹鼠商人) — 终态站立运作版
 */
class MoleTrader extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        // 优先用 Trader_stand spritesheet（48x48），fallback 老 mole_trader_img
        const tex = scene.textures.exists('Trader_stand') ? 'Trader_stand' : 'mole_trader_img';
        super(scene, x, y, tex);
        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.body.setSize(40, 48);
        this.body.setOffset(4, 0);
        this.body.setCollideWorldBounds(true);
        this.body.setAllowGravity(true);
        this.setGravityY(1750);

        // 播放 trader_stand 动画（如果存在）
        if (scene.anims && scene.anims.exists('trader_stand')) {
            this.play('trader_stand');
        }

        this.interactHintShown = false;

        this.interactionIcon = scene.add.sprite(x, y - 60, 'Trader_interection_icon');
        this.interactionIcon.setDepth(500).setVisible(false).setScale(1.2);
    }

    preUpdate(time, delta) {
        super.preUpdate(time, delta);

        let player = this.scene.player;
        if (!player || !this.interactionIcon) return;

        // 1. 强制图标同步商人坐标（防护掉落穿帮）
        this.interactionIcon.x = this.x;
        if (!this.interactHintShown) {
            this.interactionIcon.y = this.y - 60;
        }

        // 2. 始终面向玩家（玩家在右侧 → flipX=false / 左侧 → flipX=true）
        this.setFlipX(player.x < this.x);

        // 3. 跨距判定
        let dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

        // 剧情/对话期间 → 强制隐藏
        const inCinematicOrDialog = this.scene._cinematicLock ||
            (this.scene.dialogSystem && this.scene.dialogSystem.isOpen);

        if (dist < ((typeof InteractSystem !== 'undefined' && InteractSystem.RANGE) || 80) && !inCinematicOrDialog) {
            if (!this.interactHintShown) {
                this.interactHintShown = true;
                this.interactionIcon.setVisible(true);

                this.scene.tweens.add({
                    targets: this.interactionIcon,
                    y: "-=10",
                    duration: 600,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
            }
        } else {
            if (this.interactHintShown) {
                this.interactHintShown = false;
                this.interactionIcon.setVisible(false);
                this.scene.tweens.killTweensOf(this.interactionIcon);
            }
        }
    }
}