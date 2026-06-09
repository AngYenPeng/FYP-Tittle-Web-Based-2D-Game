class Player extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        super(scene, x, y, 'Miner_stand');
        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setCollideWorldBounds(true);
        // 玩家重力（可调速度参数）
        // 改为 0 = 总重力等于世界重力 1750（原本快速版本）
        // 加负值会变慢（如 -332.5 = 0.9 倍速度，-1312 = 0.5 倍速度）
        // 高度由 jump velocity 和 gravity 共同决定，公式 H = v² / (2g)
        this.setGravityY(0);
        this.setDragX(0);

        this.body.setSize(32, 48);   // (用户·双箱制) 本体永久 32×48, 头部另由 MovementSystem 手工实体负责
        this.body.setOffset(40, 61);

        // (用户) 玩家 hitbox 调试显示 — 按 H 切换 (绿=物理body, 蓝=贴图显示范围, 紫点=精灵中心)
        this._hbDebug = scene.add.graphics().setDepth(9999);
        this._hbIgnored = false;
        this._hbDebugOn = false;
        scene.input.keyboard.on('keydown-H', () => {
            this._hbDebugOn = !this._hbDebugOn;
            if (!this._hbDebugOn && this._hbDebug) this._hbDebug.clear();
            if (this.body) console.log('[Hitbox]', this._hbDebugOn ? '开' : '关',
                '| body', this.body.width + 'x' + this.body.height,
                '| offset', this.body.offset.x + ',' + this.body.offset.y);
        });

        // 显示优先级 — 大于基本所有东西 (boss/enemies/NPC/walls), 仅低于黑雾 (810) 和掉落物 (700)
        this.setDepth(600);

        this.pState = { activeHand: 'left' };

        // 只保留左右移动 —— 跳跃/换手/蹲下统一由 MovementSystem 处理新按键
        // W = 创造模式飞行向上 (普通模式不用)
        this.keys = scene.input.keyboard.addKeys({
            left:  'A',
            right: 'D',
            up:    'W',
            down:  'S'
        });
    }

    update(time, delta) {
        // (用户) 玩家 hitbox 调试框 (H 切换)
        if (this._hbDebugOn && this._hbDebug && this.body) {
            if (!this._hbIgnored && this.scene.uiCam) { try { this.scene.uiCam.ignore(this._hbDebug); this._hbIgnored = true; } catch (e) {} }
            const _g = this._hbDebug, _b = this.body;
            _g.clear();
            _g.lineStyle(1, 0x00ff00, 1).strokeRect(_b.x, _b.y, _b.width, _b.height);
            const _bd = this.getBounds();
            _g.lineStyle(1, 0x3399ff, 0.6).strokeRect(_bd.x, _bd.y, _bd.width, _bd.height);
            _g.fillStyle(0xff00ff, 1).fillCircle(this.x, this.y, 2);
        }
        if (!this.body) return;
        // (用户) 剧情锁: 过场期间玩家位置+动画完全交给剧情 (各 cutscene 自己 play run/idle),
        //   不再读按键自驱 — 否则锁定期间按住跑会自播 run 动画 (位置被摁住、动画却没人管)
        if (this.scene && this.scene._cinematicLock) return;

        // === 创造模式飞行: WASD 自由移动, 跳过其它移动逻辑 ===
        if (this.scene._creativeFly) {
            const flySpeed = 450;
            let vx = 0, vy = 0;
            if (this.keys.left.isDown)  vx -= flySpeed;
            if (this.keys.right.isDown) vx += flySpeed;
            if (this.keys.up.isDown)    vy -= flySpeed;
            if (this.keys.down.isDown)  vy += flySpeed;
            this.setVelocity(vx, vy);
            if (vx < 0) this.setFlipX(true);
            else if (vx > 0) this.setFlipX(false);
            // offset 跟正常 stand 一致
            // (用户) 图像朝向倾斜 ±8: origin 反向挪 8 (图动) + offset 配对 (箱不动, 左缘恒 x−16)
            this.setOrigin(this.flipX ? 0.5625 : 0.4375, 0.5);
            const standOffsetX = this.flipX ? 56 : 40;
            this.body.setOffset(standOffsetX, this.scene.isCrouching ? 47 : 63);   // (用户·双箱制) 蹲姿贴图+16 配 47, 底边恒 y+47
            return;
        }

        let isMoving = false;

        let standOffsetX_Right = 40;   // (用户) 倾斜对: 与 origin 0.4375 配平, body 左缘 x−16
        let standOffsetX_Left  = 56;   // 与 origin 0.5625 配平, 同为 x−16
        let standOffsetY       = this.scene.isCrouching ? 47 : 63;   // (用户·双箱制) 蹲 47 / 站 63 — 抵消蹲姿贴图下移
        let runOffsetX_Right = 40;
        let runOffsetX_Left  = 56;
        let runOffsetY       = this.scene.isCrouching ? 47 : 63;   // 同上

        // 攻击中：完全不修改 offset/flipX（MeleeSystem 已经处理 offset）
        // 只允许 A/D 微调速度
        if (this.scene.isMeleeAttacking) {
            if (this.keys.left.isDown) {
                this.setVelocityX(Math.min(this.body.velocity.x, -150));
            } else if (this.keys.right.isDown) {
                this.setVelocityX(Math.max(this.body.velocity.x, 150));
            }
            return;
        }

        // 蜘蛛 cling penalty: 每只蜘蛛贴身 → 速度/跳跃 × 0.9
        const clingCount = this.scene._clingingSpiderCount || 0;
        const clingMul = Math.pow(0.9, clingCount);
        // 疾病减速 (阶段 4) — slowPct=50 → mul=0.5
        const diseaseMul = (this.scene.diseaseSystem && this.scene.diseaseSystem.getSpeedMultiplier)
            ? this.scene.diseaseSystem.getSpeedMultiplier() : 1;
        const moveSpeed = 450 * clingMul * diseaseMul;

        if (this.keys.left.isDown) {
            this.setVelocityX(-moveSpeed);
            this.setFlipX(true);
            this.setOrigin(0.5625, 0.5);   // (用户) 图左倾 8
            this.body.setOffset(runOffsetX_Left, runOffsetY);
            isMoving = true;
        } else if (this.keys.right.isDown) {
            this.setVelocityX(moveSpeed);
            this.setFlipX(false);
            this.setOrigin(0.4375, 0.5);   // (用户) 图右倾 8
            this.body.setOffset(runOffsetX_Right, runOffsetY);
            isMoving = true;
        } else {
            this.setVelocityX(0);
            this.setOrigin(this.flipX ? 0.5625 : 0.4375, 0.5);   // (用户) 站立同倾
            if (this.flipX) this.body.setOffset(standOffsetX_Left, standOffsetY);
            else            this.body.setOffset(standOffsetX_Right, standOffsetY);
        }

        let onGround = this.body.blocked.down || this.body.touching.down;

        const cur = this.anims.currentAnim?.key;
        const has = (key) => this.scene.anims.exists(key);
        // 安全 play — 检查 anim 注册了且有 frames
        const safePlay = (key) => {
            if (!has(key)) return;
            const anim = this.scene.anims.get(key);
            if (!anim || !anim.frames || anim.frames.length === 0) {
                console.warn('[Player] anim', key, 'has no frames — removing');
                try { this.scene.anims.remove(key); } catch(e) {}
                return;
            }
            try { this.play(key); } catch(e) { console.warn('[Player] play failed:', key, e); }
        };

        // 冲刺中 — 不覆盖 dash 动画
        if (this.scene.isDashing && cur === 'dash') return;

        // 蹲下中：挂墙=静态蹲；空中(蹲跳)或移动用 crouch_walk，静止落地用 crouch
        if (this.scene.isCrouching) {
            if (this.scene.isHanging) {
                // (用户) 挂墙时只用静态蹲 — 不播蹲走 crouch_walk
                if (has('crouch') && cur !== 'crouch') safePlay('crouch');
            } else if (!onGround || isMoving) {
                // (用户) 蹲跳动画 = 蹲走动画 (空中保持蹲姿, 用 crouch_walk)
                if (has('crouch_walk') && cur !== 'crouch_walk') safePlay('crouch_walk');
                else if (!has('crouch_walk') && has('crouch') && cur !== 'crouch') safePlay('crouch');
            } else {
                if (has('crouch') && cur !== 'crouch') safePlay('crouch');
            }
            return;
        }

        if (!onGround) {
            let vy = this.body.velocity.y;
            if (vy < -50) {
                if (has('jump') && cur !== 'jump') safePlay('jump');
            } else {
                if (has('fall') && cur !== 'fall') safePlay('fall');
            }
        } else if (isMoving) {
            if (cur !== 'run') safePlay('run');
        } else {
            if (cur !== 'idle') safePlay('idle');
        }
    }
}