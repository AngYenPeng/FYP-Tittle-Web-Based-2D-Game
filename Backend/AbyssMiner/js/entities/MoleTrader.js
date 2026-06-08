/**
 * Mole Trader (地鼠奸商) — 终极独立运作版
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

        // (用户) 检测到 trader_dig 动画播放 (反向/正向都算) → 播 MoleDig (assets/audio/NPC/MoleDig.wav)
        this.on(Phaser.Animations.Events.ANIMATION_START, (anim) => {
            if (anim && anim.key === 'trader_dig' && typeof AudioSystem !== 'undefined') AudioSystem.sfx(scene, 'MoleDig');
        });
        // (用户) 出场钻地: 钻地期间冻结物理 (关 body+重力) 防掉出世界; 钻完落回出生点站立
        // (用户) 出生只站立, 不自动钻地 (避免一进场远处就响钻地声); 钻地改为玩家靠近时触发 (见 preUpdate)
        if (scene.anims && scene.anims.exists('trader_stand')) this.play('trader_stand');
        this._emergeStarted = false;

        this.interactHintShown = false;

        this.interactionIcon = scene.add.sprite(x, y - 60, 'Trader_interection_icon');
        this.interactionIcon.setDepth(500).setVisible(false).setScale(1.2);
    }

    preUpdate(time, delta) {
        super.preUpdate(time, delta);

        let player = this.scene.player;
        if (!player || !this.interactionIcon) return;

        // 1. 强制图标同步商人坐标（防掉落穿帮）
        this.interactionIcon.x = this.x;
        if (!this.interactHintShown) {
            this.interactionIcon.y = this.y - 60;
        }

        // 2. 始终面向玩家（玩家在右侧 → flipX=false / 左侧 → flipX=true）
        this.setFlipX(player.x < this.x);

        // 3. 距离判定
        let dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

        // (用户) 玩家靠近 (≤5格) 首次 → 钻地出场 (反向 dig + MoleDig 监听自动发声), 1.8s 后站立
        if (!this._emergeStarted && dist < 5 * 32 && this.scene.anims && this.scene.anims.exists('trader_dig')) {
            this._emergeStarted = true;
            if (typeof this.playReverse === 'function') this.playReverse('trader_dig');
            else this.play('trader_dig');
            this.scene.time.delayedCall(1800, () => { if (this.scene.anims && this.scene.anims.exists('trader_stand')) this.play('trader_stand'); });
        }

        // 剧情/对话期间 → 强制隐藏
        const inCinematicOrDialog = this.scene._cinematicLock ||
            (this.scene.dialogSystem && this.scene.dialogSystem.isOpen);

        if (dist < ((typeof InteractSystem !== 'undefined' && InteractSystem.RANGE) || 80) && !inCinematicOrDialog) {   // (用户) 图标距离 = 交互距离, 全游戏统一
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