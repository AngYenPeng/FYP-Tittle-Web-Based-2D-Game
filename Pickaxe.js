class Pickaxe extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        super(scene, x, y, 'pickaxe_img');
        
        // 添加到场景并开启物理
        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.state = 'idle'; // 状态: idle, flying_max, flying_gravity, attached, returning
        this.disableBody(true, true); 
        this.setBounce(0.2);
        this.setCollideWorldBounds(true);
        this.returnTimer = null;
    }

    /**
     * 发射逻辑
     * @param {boolean} isMaxCharge - 是否重蓄力（重蓄力才能钉墙）
     */
    fire(playerX, playerY, targetX, targetY, power, isMaxCharge) {
        this.enableBody(true, playerX, playerY, true, true);
        
        let angle = Phaser.Math.Angle.Between(playerX, playerY, targetX, targetY);
        this.body.setAllowGravity(true);
        
        // 维持之前的设定：重蓄力下坠慢(1000)，轻蓄力下坠快(1750)
        this.body.setGravityY(isMaxCharge ? 1000 : 1750); 

        this.state = isMaxCharge ? 'flying_max' : 'flying_gravity';
        this.scene.physics.velocityFromRotation(angle, power, this.body.velocity);

        // 轻蓄力专属：350ms 后自动开始往回飞
        if (this.returnTimer) this.returnTimer.remove();
        if (!isMaxCharge) {
            this.returnTimer = this.scene.time.delayedCall(350, () => {
                if (this.state === 'flying_gravity') this.state = 'returning';
            });
        }
    }

    /**
     * 撞墙逻辑（由 main.js 的 collider 调用）
     */
    onHit() {
        if (this.state === 'flying_max') {
            // 重蓄力：成功钉在墙上
            this.state = 'attached';
            if (this.returnTimer) this.returnTimer.remove();
            
            this.body.setAllowGravity(false);
            this.body.setVelocity(0, 0);
            this.body.setImmovable(true);
        } else if (this.state === 'flying_gravity') {
            // 轻蓄力：撞墙直接返回，不钉墙
            this.state = 'returning';
        }
    }

    update(player) {
        if (this.state === 'idle') return;

        // --- 彻底删除了 400 像素限制 ---
        // 现在你带着绳子跑多远都不会被“卡住”了。

        // 返回模式：无视重力，加速飞向玩家
        if (this.state === 'returning') {
            this.body.setAllowGravity(false);
            // 速度设为 1300，配合 main.js 里的 50 像素强力回收判定
            this.scene.physics.moveToObject(this, player, 1300);
        }
        
        // 旋转效果：只要没钉在墙上，就一直转
        if (this.state !== 'attached') {
            this.rotation += 0.35; 
        }
    }

    /**
     * 彻底重置铁镐
     */
    backToInventory() {
        this.state = 'idle';
        if (this.returnTimer) this.returnTimer.remove();
        this.disableBody(true, true);
        this.body.setImmovable(false);
        this.rotation = 0;
    }
}