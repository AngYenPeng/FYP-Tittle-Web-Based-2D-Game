/**
 * 坚岩甲虫 (Hardrock Beetle) HP=10
 * 移动极慢，永远面向玩家。免疫铁镐伤害。被攻击不击退。
 * 【新增】80px 内蓄力 0.5s（黄色）→ 朝玩家小冲刺攻击 → 攻击 cd 5秒
 * 攻击玩家伤害：只有 dashing 状态才扣血
 */
class HardrockBeetle extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        super(scene, x, y, 'beetle_img');
        scene.add.existing(this);
        scene.physics.add.existing(this);
        // ⚠️ Phaser body.width 会自动乘 sprite.scaleX, 所以 setScale(1.5) 后 setSize(32) 会变成 48 hitbox
        // 反过来 setSize(32/1.5) ≈ 21.33, × scale 1.5 后 body 真正 = 32×32 hitbox
        this.setScale(1.5);  // 图片放大 1.5 倍 (32 anim 帧 → 48 视觉)
        this.body.setSize(32 / 1.5, 32 / 1.5, false);  // false = 不自动算 offset (会基于占位贴图算错)
        // 手动 offset: body.x = sprite.x - displayOriginX(24) + offset.x; 要 body 中心在 sprite.x 则 offset.x = 8
        this.body.setOffset(8, 8);
        // 立刻播 anim 避免占位贴图 beetle_img (48×30) 闪现 (× 1.5 = 72×45 会很大)
        if (scene.anims.exists('beetle_run')) {
            this.play('beetle_run');
            this._lastAnimKey = 'beetle_run';
        }
        this.body.setCollideWorldBounds(true);
        this.setGravityY(1750);

        this.state = 'patrol';
        this.hp = 10;
        this.moveSpeed = 28;
        this.facingRight = true;
        this.forceAggroTimer = 0;

        // 攻击相关
        this.chargeTimer = 0;
        this.dashTimer = 0;
        this.attackCD = 0;
        this.attackDir = 1;
    }

    canDamagePlayer() { return this.state === 'dashing'; }

    update(time, delta, player) {
        if (this.hp <= 0) return;
        if (this.forceAggroTimer > 0) this.forceAggroTimer -= delta;
        if (this.attackCD > 0) this.attackCD -= delta;

        let onGround = this.body.blocked.down || this.body.touching.down;
        if (!onGround) return;

        let dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
        let inRange = dist < 600 || this.forceAggroTimer > 0;

        if (!inRange) { this.body.setVelocityX(0); return; }

        // 状态机
        switch (this.state) {
            case 'patrol':
                // 永远面向玩家
                this.facingRight = player.x > this.x;
                this.setFlipX(!this.facingRight);
                let speed = this.moveSpeed * 1.5;
                this.body.setVelocityX((this.facingRight ? 1 : -1) * speed);
                if (this.body.blocked.left || this.body.blocked.right) this.body.setVelocityX(0);

                // 80px 以内且 cd 好了：开始蓄力
                if (dist <= 80 && this.attackCD <= 0) {
                    this.state = 'charging';
                    this.chargeTimer = 0;
                    this.body.setVelocityX(0);
                    this.attackDir = player.x > this.x ? 1 : -1;
                    this.setTint(0xffff00); // 蓄力黄色
                }
                break;

            case 'charging':
                this.body.setVelocityX(0);
                this.chargeTimer += delta;
                // 蓄力期间继续面向玩家
                this.facingRight = player.x > this.x;
                this.setFlipX(!this.facingRight);
                if (this.chargeTimer >= 500) {
                    this.state = 'dashing';
                    this.dashTimer = 0;
                    this.attackDir = this.facingRight ? 1 : -1;
                    this.clearTint();
                    this.body.setVelocityX(this.attackDir * 350);
                }
                break;

            case 'dashing':
                this.dashTimer += delta;
                // 撞墙或超时（300ms） → 进入 cooldown
                if (this.dashTimer >= 300 || this.body.blocked.left || this.body.blocked.right) {
                    this.state = 'patrol';
                    this.body.setVelocityX(0);
                    this.attackCD = 5000;
                }
                break;
        }

        this._updateAnim();
    }

    isBackHit(pick) {
        return this.facingRight === (pick.body.velocity.x > 0);
    }

    takeDamage(amount) {
        if (this.hp <= 0) return;
        this.hp -= amount;
        if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this.scene, this.hp > 0 ? 'Beetle_Hurt' : 'Beetle_Death');   // (用户) 受伤/死亡音效
        this.forceAggroTimer = 5000;
        // 受击红色（甲虫不击退）
        this.setTint(0xff0000);
        this._hitTimer = 240;  // injured anim window
        if (this.scene.anims.exists('beetle_injuried')) this.play('beetle_injuried');
        this._lastAnimKey = 'beetle_injuried';
        this.scene.time.delayedCall(120, () => {
            if (this.hp > 0) {
                if (this.state === 'charging') this.setTint(0xffff00);
                else this.clearTint();
            }
        });
        if (this.hp <= 0) {
            this.scene.events.emit('monster_killed', this.x, this.y, 0.1);
            this.setTint(0x333333);
            this.body.setVelocityY(-150);
            if (this.scene.anims.exists('beetle_dead')) this.play('beetle_dead');
            this._lastAnimKey = 'beetle_dead';
            this.scene.time.delayedCall(600, () => { if (this.scene) this.destroy(); });
        }
    }

    /** state → anim mapping */
    _updateAnim() {
        if (this.hp <= 0) return;
        let key;
        if (this._hitTimer > 0) {
            this._hitTimer -= this.scene.game.loop.delta;
            key = 'beetle_injuried';
        } else if (this.state === 'charging') {
            key = 'beetle_attack';  // 蓄力 + 攻击
        } else if (this.state === 'dashing' || this.state === 'patrol') {
            key = 'beetle_run';
        } else {
            key = 'beetle_idle';
        }
        if (key !== this._lastAnimKey) {
            this._lastAnimKey = key;
            if (this.scene.anims.exists(key)) this.play(key);
        }
    }
}