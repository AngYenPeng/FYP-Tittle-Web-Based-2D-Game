/**
 * 水晶蚯蚓 (Crystal Earthworm) HP=9
 * 平时隐藏 → 玩家靠近 → 1秒破土 → 蚯蚓式蠕动追玩家
 *   蠕动模式：尾巴缩 → 头部前伸 → 暂停 → 重复（动停动停）
 * 攻击：靠近玩家时蓄力（黄色）→ 跳起来攻击 → 攻击 cd 5秒
 * 攻击玩家伤害：只有 pounce 状态才能扣血（破土动画期间无伤害）
 */
class CrystalEarthworm extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        super(scene, x, y, 'earthworm_img');
        scene.add.existing(this);
        scene.physics.add.existing(this);

        // hitbox 1 格 (32×32), body 中心在 entity 位置
        this.body.setSize(32, 32);
        this.body.setOffset(0, -15);   // 配合 origin 偏移, body 仍然中心在 (this.x, this.y)
        this.body.setAllowGravity(true);   // 一开始就有重力, 立刻落地
        this.body.setImmovable(false);
        this.setCollideWorldBounds(true);
        // 所有 anim 显示往下偏移 15px (origin Y 在 sprite 顶部+1px 处)
        this.setOrigin(0.5, 1 / 32);

        this.state = 'hidden';
        this.hp = 9;
        this.dir = 1;
        this.moveSpeed = 50;
        this.timer = 0;
        this.actionTimer = 0;
        this.knockbackTimer = 0;
        this.forceAggroTimer = 0;
        this.surfaceTimer = 0;
        this.canDamage = false;

        // 攻击 cd
        this.attackCD = 0;

        // 隐藏时不可见 (原橙色长条占位已删) — 落地之后还是不可见
        this.setVisible(false);
    }

    canDamagePlayer() { return this.state === 'pounce'; }

    _finishSurface() {
        this.state = 'chase';
        this.canDamage = true;
        this.setVisible(true);
        this.setAlpha(1);
        this.clearTint();
        this.body.setImmovable(false);
        this.body.setAllowGravity(true);
    }

    /** 蚯蚓式蠕动方法已删除 — 改用蜘蛛风格 velocity 直接走 */

    update(time, delta, player) {
        if (this.hp <= 0) return;
        if (this.knockbackTimer > 0) { this.knockbackTimer -= delta; return; }
        if (this.forceAggroTimer > 0) this.forceAggroTimer -= delta;
        if (this.attackCD > 0) this.attackCD -= delta;

        let dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
        let inRange = dist < 150 || this.forceAggroTimer > 0;
        let dirP = player.x > this.x ? 1 : -1;
        let onGround = this.body.blocked.down || this.body.touching.down;

        if (this.state === 'hidden') {
            // 隐身, 重力让 body 自然落地; 玩家靠近 → 进 surfacing 先播 popup anim
            if (inRange) {
                this.state = 'surfacing';
                this.surfaceTimer = 0;
                this.setVisible(true);
                // 立刻 play pop_up — 避免显示一帧占位贴图 (橙色长方形 earthworm_img 48×20)
                if (this.scene.anims.exists('earthworm_pop_up')) {
                    this.play('earthworm_pop_up');
                    this._lastAnimKey = 'earthworm_pop_up';
                }
            }
            return;
        }

        if (this.state === 'surfacing') {
            // 1 秒 popup 期间不移动不攻击, 重力照常 (落地)
            // 受到伤害会在 takeDamage 里 _finishSurface() 强制结束 → 进 chase
            this.body.setVelocity(0, this.body.velocity.y);
            this.surfaceTimer += delta;
            if (this.surfaceTimer >= 1000) {
                this._finishSurface();
            }
            return;
        }

        if ((this.state === 'wander' || this.state === 'idle' || this.state === 'chase') && onGround) {
            if (inRange) {
                if (dist <= 140 && Math.abs(player.y - this.y) < 100 && this.attackCD <= 0) {
                    this.state = 'prepare';
                    this.timer = 500;
                    this.body.setVelocityX(0);
                    this.setTint(0xffff00); // 黄色蓄力
                } else {
                    this.state = 'chase';
                }
            } else if (this.state === 'chase') {
                this.state = 'idle';
                this.actionTimer = 1000;
            }
        }

        switch (this.state) {
            case 'idle':
                this.body.setVelocityX(0);
                this.actionTimer -= delta;
                if (this.actionTimer <= 0) {
                    this.state = 'wander';
                    this.dir = Math.random() > 0.5 ? 1 : -1;
                    this.actionTimer = Phaser.Math.Between(1500, 3000);
                }
                break;
            case 'wander':
                this.body.setVelocityX(this.moveSpeed * this.dir);
                this.actionTimer -= delta;
                if (this.body.blocked.left || this.body.blocked.right) this.dir *= -1;
                if (this.actionTimer <= 0) {
                    this.state = 'idle';
                    this.actionTimer = Phaser.Math.Between(1000, 2000);
                }
                break;
            case 'chase':
                this.dir = dirP;
                this.body.setVelocityX(this.moveSpeed * 1.5 * this.dir);
                break;
            case 'prepare':
                this.timer -= delta;
                if (this.timer <= 0) {
                    this.state = 'pounce';
                    this.clearTint();
                    this.body.setVelocityY(-280);
                    this.body.setVelocityX(dirP * 250);
                    this.setScale(1, 1);
                }
                break;
            case 'pounce':
                if (onGround && this.body.velocity.y >= 0) {
                    this.state = 'cooldown';
                    this.timer = 1200;
                    this.attackCD = 5000; // 攻击后 5 秒 cd 才能再蓄力跳
                    this.body.setVelocityX(0);
                }
                break;
            case 'cooldown':
                this.timer -= delta;
                this.body.velocity.x *= 0.9;
                if (this.timer <= 0) {
                    this.state = inRange ? 'chase' : 'idle';
                    this.actionTimer = 1000;
                }
                break;
        }

        this._updateAnim();
    }

    takeDamage(amount, srcX, srcY) {
        if (this.hp <= 0) return;
        if (this.state === 'surfacing') this._finishSurface();
        if (this.state === 'hidden') this._finishSurface();

        this.hp -= amount;
        this.forceAggroTimer = 5000;
        if (srcX !== undefined) {
            let d = this.x >= srcX ? 1 : -1;
            this.body.setImmovable(false); this.body.setAllowGravity(true);
            this.body.setVelocity(d * 250, -100);
            this.knockbackTimer = 240;
        }
        this.setTint(0xff0000);
        this.scene.time.delayedCall(120, () => {
            if (this.hp > 0) {
                if (this.state === 'prepare') this.setTint(0xffff00);
                else this.clearTint();
            }
        });
        if (this.hp <= 0) {
            this.scene.events.emit('monster_killed', this.x, this.y, 0.1);
            this.setTint(0x444444);
            if (this.scene.anims.exists('earthworm_dead')) this.play('earthworm_dead');
            this._lastAnimKey = 'earthworm_dead';
            this.scene.time.delayedCall(400, () => { if (this.scene) this.destroy(); });
        }
    }

    /** state → anim mapping */
    _updateAnim() {
        if (this.hp <= 0) return;
        if (this.state === 'hidden') return;  // 隐藏时不变 anim (sprite 也是 invisible)
        let key;
        if (this.knockbackTimer > 0) {
            key = 'earthworm_injuried';
        } else if (this.state === 'surfacing') {
            key = 'earthworm_pop_up';
        } else if (this.state === 'prepare' || this.state === 'pounce') {
            key = 'earthworm_attack';
        } else if (this.state === 'wander' || this.state === 'chase') {
            key = 'earthworm_move';
        } else {
            key = 'earthworm_idle';  // idle / cooldown
        }
        if (key !== this._lastAnimKey) {
            this._lastAnimKey = key;
            if (this.scene.anims.exists(key)) this.play(key);
        }
    }
}