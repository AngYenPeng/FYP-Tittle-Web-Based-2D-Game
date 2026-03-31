class Player extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        super(scene, x, y, 'player_img');
        
        // 1. 将对象添加到场景和物理系统
        scene.add.existing(this);
        scene.physics.add.existing(this);

        // 2. 基础物理属性
        this.setCollideWorldBounds(true);
        this.setGravityY(1750); // 维持 1750 的重力感
        
        // --- 核心：彻底消除惯性 ---
        // 既然我们使用瞬时速度控制，就不再需要系统自动减速的阻力
        this.setDragX(0); 

        // 3. 玩家状态：记录当前活跃的手 (left / right)
        this.pState = {
            activeHand: 'left' 
        };

        // 4. 按键绑定
        // 删除了 Q 和 E，只保留 A, D, W 和 SPACE
        this.keys = scene.input.keyboard.addKeys({
            left: 'A',
            right: 'D',
            jumpW: 'W',
            space: 'SPACE'
        });
    }

    update(time, delta) {
        if (!this.body) return;

        // --- 核心：硬切移动逻辑 (无惯性) ---
        // 直接设置 Velocity (速度) 而不是 Acceleration (加速度)
        // 这样松开按键时，速度会立刻变为 0，不会往前滑
        if (this.keys.left.isDown) {
            this.setVelocityX(-450); // 移动速度设为 450
            this.setFlipX(true);     // 角色转向左侧
        } else if (this.keys.right.isDown) {
            this.setVelocityX(450);  // 移动速度设为 450
            this.setFlipX(false);    // 角色转向右侧
        } else {
            // 松开 A 或 D，速度立刻清零，绝不拖泥带水
            this.setVelocityX(0);
        }

        // --- 跳跃逻辑：锁定 W 键 ---
        // 只有站在地板上（blocked.down）时才能跳跃
        let onGround = this.body.blocked.down || this.body.touching.down;
        
        if (Phaser.Input.Keyboard.JustDown(this.keys.jumpW) && onGround) {
            // 修复：高度增加到 -950，手感更轻盈
            this.setVelocityY(-950); 
        }

        // --- 空格切换逻辑：单键循环 ---
        // 使用 JustDown 确保按一下只切换一次，防止长按导致状态疯狂闪烁
        if (Phaser.Input.Keyboard.JustDown(this.keys.space)) {
            // 如果是左手就切到右手，如果是右手就切到左手
            if (this.pState.activeHand === 'left') {
                this.pState.activeHand = 'right';
            } else {
                this.pState.activeHand = 'left';
            }
            
            console.log("当前活跃手:", this.pState.activeHand);
            
            // 兼容性检查：如果场景有 UI 刷新逻辑则调用
            if (this.scene.updateUI) {
                this.scene.updateUI();
            }
        }
    }
}