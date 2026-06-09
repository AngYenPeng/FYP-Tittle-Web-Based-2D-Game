class Pickaxe extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        super(scene, x, y, 'pickaxe_img');

        // 添加到场景并开启物理
        scene.add.existing(this);
        scene.physics.add.existing(this);

        // 换图: 用户 Pickaxe.png (32×32) 替换黄块; body 保持 16×16 居中 (碰撞不变, 视觉头部可埋进墙)
        if (scene.textures.exists('Pickaxe')) {
            this.setTexture('Pickaxe');
            if (this.body) { this.body.setSize(16, 16); this.body.setOffset(8, 8); }
        }

        this.state = 'idle'; // idle, flying_max, dropping, attached, returning
        this.disableBody(true, true);
        this.setBounce(0.2);
        this.setCollideWorldBounds(true);
        this.returnTimer = null;
        this._spinSpeed = (8 * Math.PI) / 60;   // 飞行顺时针旋转: 4圈/秒 (@60fps)
        this._stuckApplied = false;
        this._limitApplied = false;
    }

    /**
     * 发射: 瞬发、零重力直线抛出
     */
    fire(playerX, playerY, targetX, targetY, power, isMaxCharge) {
        this.enableBody(true, playerX, playerY, true, true);
        // enableBody 可能重置 body, 重新锁定 16×16 居中
        if (this.scene.textures.exists('Pickaxe') && this.body) { this.body.setSize(16, 16); this.body.setOffset(8, 8); }

        let angle = Phaser.Math.Angle.Between(playerX, playerY, targetX, targetY);

        // 彻底关闭抛出时的重力 — 指哪打哪
        this.body.setAllowGravity(false);
        this.body.setGravityY(0);

        this.state = 'flying_max';
        this._stuckApplied = false;
        this._limitApplied = false;

        // 扫掠防穿墙起点 = 发射点
        this._prevX = playerX;
        this._prevY = playerY;
        this._lastCX = playerX;
        this._lastCY = playerY;
        // 记录飞行方向 (钉墙定角度用)
        this._lastVx = Math.cos(angle);
        this._lastVy = Math.sin(angle);

        this.scene.physics.velocityFromRotation(angle, power, this.body.velocity);

        if (this.returnTimer) { this.returnTimer.remove(); this.returnTimer = null; }
    }

    /**
     * 撞墙逻辑（由 collider / 各场景 handlePickCollide 统一接管，这里保留基本状态转换）
     */
    onHit() {
        if (this.state === 'flying_max') {
            this.state = 'attached';
            if (this.returnTimer) this.returnTimer.remove();
            this.body.setAllowGravity(false);
            this.body.setVelocity(0, 0);
            this.body.setImmovable(true);
        }
    }

    update(player) {
        if (this.state === 'idle') return;

        // 返回模式: 无视重力加速飞向玩家; 握把对着飞来的方向(远端) = 头朝玩家
        if (this.state === 'returning' || this.state === 'pre_returning') {
            this.body.setAllowGravity(false);
            this.scene.physics.moveToObject(this, player, 1300);
            const ang = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
            this.rotation = ang + Math.PI / 2;   // 头(图片上方)沿飞行方向 → 握把拖在后面
            this._stuckApplied = false;
            this._limitApplied = false;
            return;
        }

        // 即将拉向稿子 (grapple 前置): 保持钉墙角度不动
        if (this.state === 'pre_zipping') return;

        // 钉墙: 按撞墙方向 snap 一次 (右/下/左/上 → 45/135/225/315)
        if (this.state === 'attached') {
            if (!this._stuckApplied) {
                this._stuckApplied = true; this._applyStickAngle();
                if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this.scene, 'PickaxeHitThings', { volume: AudioSystem.sfxVolume * 0.5 });   // (修复·用户) 稿子钉墙音 — 乘 sfxVolume
            }
            return;
        }

        // 丢到极限 (超 WARNING_DISTANCE → dropping 坠落): 按丢出方向定角一次 — 握把对着飞来的方向
        if (this.state === 'dropping') {
            if (!this._limitApplied) {
                this._limitApplied = true;
                const ang = Math.atan2(this._lastVy || 0, this._lastVx || 1);
                this.rotation = ang + Math.PI / 2;   // 头沿丢出方向, 握把朝飞来那侧
            }
            // 坠落中继续记录速度方向 (之后落地钉墙用真实下落方向)
            if (this.body && (this.body.velocity.x !== 0 || this.body.velocity.y !== 0)) {
                this._lastVx = this.body.velocity.x;
                this._lastVy = this.body.velocity.y;
            }
            return;
        }

        // 飞行中 (flying_max / flying_gravity): 记录速度方向 + 旋转
        if (this.body && (this.body.velocity.x !== 0 || this.body.velocity.y !== 0)) {
            this._lastVx = this.body.velocity.x;
            this._lastVy = this.body.velocity.y;
        }
        // (用户) 只看水平方向不看高度: 往右飞顺时针 4圈/秒, 往左飞逆时针 4圈/秒
        this.rotation += ((this._lastVx || 0) < 0 ? -1 : 1) * this._spinSpeed;
        this._stuckApplied = false;
        this._limitApplied = false;
    }

    /** 钉墙角度: 按最后飞行方向判定撞右/下/左/上墙.
     *  (用户) 只看水平方向: 往右飞用顺时针角度组 (45/135/315), 往左飞全部镜像成逆时针组 (315/225/45) */
    _applyStickAngle() {
        const vx = this._lastVx || 0, vy = this._lastVy || 0;
        const left = vx < 0;   // 只看水平方向, 不看高度
        let deg;
        const vertical = Math.abs(vx) < Math.abs(vy) * 0.4;   // (用户) 接近竖直的飞行(±22°内) → 垂直插入
        if (Math.abs(vx) >= Math.abs(vy)) {
            deg = left ? 315 : 45;    // 撞左墙 → 315° (45° 的镜像, 头朝左上) ; 撞右墙 → 45° (头朝右上)
        } else if (vy >= 0) {
            deg = vertical ? 180 : (left ? 225 : 135);   // 砸地面: 竖直 → 180° 头朝正下; 斜飞 → 左 225° / 右 135°
        } else {
            deg = vertical ? 0 : (left ? 45 : 315);      // 撞天花板: 竖直 → 0° 头朝正上; 斜飞 → 左 45° / 右 315°
        }
        this.rotation = Phaser.Math.DegToRad(deg);
    }

    /**
     * 彻底重置铁镐回背包
     */
    backToInventory() {
        this.state = 'idle';
        if (this.returnTimer) this.returnTimer.remove();
        this.disableBody(true, true);
        this.body.setImmovable(false);
        this.rotation = 0;
        this._stuckApplied = false;
    }
}