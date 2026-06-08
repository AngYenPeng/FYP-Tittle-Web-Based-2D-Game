/**
 * 晶化史莱姆 (Crystal Slime)
 * 跳的瞬间才有水平移动。死亡分裂成两只 Mini Slime。
 * 警戒外自由跳跃（50/50随机方向 + 1-3次 + 3秒休息）
 * 攻击玩家伤害：只有跳跃中（在空中且向上飞 / 向下飞）才扣血
 * 攻击玩家成功后落地 5 秒不动
 */
class CrystalSlime extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y, isMini = false) {
        // 直接用 Slime_jump 的第 0 帧（避免显示 fallback 绿球纹理）
        const initKey = scene.textures.exists('Slime_jump') ? 'Slime_jump' : 'slime_img';
        super(scene, x, y, initKey, 0);
        scene.add.existing(this); scene.physics.add.existing(this);

        this.isMini = isMini;
        this.knockbackTimer = 0;

        // hitbox: Slime 32x32 / Mini 16x16；显示 ×1.5（图片放大）
        const tw = this.width || 32, th = this.height || 32;
        if (isMini) {
            this.setScale(24 / tw, 24 / th);  // 显示 24x24（hitbox 16 × 1.5）
            this.body.setSize(16 * tw / 24, 16 * th / 24);  // 实际世界 hitbox 16x16
            this.body.setOffset((tw - 16 * tw / 24) / 2, (th - 16 * th / 24) / 2);
            this.hp = 2;
            this.jumpForce = -420;
            this.jumpSpeedX = 140;
        } else {
            this.setScale(48 / tw, 48 / th);  // 显示 48x48（hitbox 32 × 1.5）
            this.body.setSize(32 * tw / 48, 32 * th / 48);  // 实际世界 hitbox 32x32
            this.body.setOffset((tw - 32 * tw / 48) / 2, (th - 32 * th / 48) / 2);
            this.hp = 5;
            this.jumpForce = -550;
            this.jumpSpeedX = 100;
        }

        this.body.setCollideWorldBounds(true);
        this.setGravityY(1750);
        this.jumpTimer = 0;
        this.jumpInterval = isMini ? 700 : 1000;
        this.forceAggroTimer = 0;

        this.wanderState = 'idle';
        this.wanderDir = 1;
        this.wanderJumpsLeft = 0;
        this.wanderRestTimer = 0;

        this.dmgCdTimer = 0;   // (用户) 命中玩家后的伤害冷却 — 期间照常跳跃, 只是不造成伤害

        // 立刻 pause 在 Slime_jump 首帧（防止生成时显示原始绿球纹理）
        if (scene.anims.exists('slime_jump')) {
            this.play('slime_jump');
            this.anims.pause();
        }
    }

    canDamagePlayer() {
        // 在空中跳跃时才能伤害玩家; 命中后的 CD 期间不再伤害 (但行动不受限)
        if (this.dmgCdTimer > 0) return false;
        let onGround = this.body.blocked.down || this.body.touching.down;
        return !onGround;
    }

    /** 玩家被本怪打中后调用 — (用户) 不再冻结: 立即进 5 秒伤害 CD, 期间继续正常跳跃 */
    onHitPlayer() {
        this.dmgCdTimer = 5000;
        if (this.scene && this.scene.anims.exists('slime_attack')) {
            this.play('slime_attack', true);
        }
    }

    _rollWanderAction() {
        this.wanderDir = (Math.random() < 0.5) ? -1 : 1;
        this.wanderJumpsLeft = Phaser.Math.Between(1, 3);
        this.wanderState = 'wander_jumping';
    }

    update(time, delta, player) {
        if (this.hp <= 0) return;
        if (this.knockbackTimer > 0) { this.knockbackTimer -= delta; return; }
        if (this.forceAggroTimer > 0) this.forceAggroTimer -= delta;

        let onGround = this.body.blocked.down || this.body.touching.down;

        // === 动画状态 ===
        const scene = this.scene;
        if (scene) {
            const vy = this.body.velocity.y;
            if (!onGround && vy < 0) {
                if (scene.anims.exists('slime_jump') && this.anims.currentAnim?.key !== 'slime_jump') {
                    this.play('slime_jump', true);
                }
            } else if (onGround && this._wasInAir) {
                if (scene.anims.exists('slime_fall')) this.play('slime_fall', true);
            }
            this._wasInAir = !onGround;
        }

        // (用户) 伤害 CD 只滴答, 不限制任何行动 (旧版落地冻结 5 秒站桩已拆除)
        if (this.dmgCdTimer > 0) this.dmgCdTimer -= delta;

        let dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
        let inRange = dist < 600 || this.forceAggroTimer > 0;

        if (onGround) this.body.setVelocityX(0);

        if (inRange) {
            let dir = player.x > this.x ? 1 : -1;
            this.setFlipX(dir < 0);

            this.jumpTimer += delta;
            if (onGround && this.jumpTimer >= this.jumpInterval) {
                this.jumpTimer = 0;
                this.body.setVelocityY(this.jumpForce);
                this.body.setVelocityX(this.jumpSpeedX * dir);
            }
            this.wanderState = 'idle';
        } else {
            this.setFlipX(this.wanderDir < 0);
            switch (this.wanderState) {
                case 'idle':
                    this._rollWanderAction();
                    this.jumpTimer = this.jumpInterval;
                    break;
                case 'wander_jumping':
                    if (this.wanderDir > 0 && this.body.blocked.right) this.wanderDir = -1;
                    if (this.wanderDir < 0 && this.body.blocked.left) this.wanderDir = 1;
                    this.jumpTimer += delta;
                    if (onGround && this.jumpTimer >= this.jumpInterval) {
                        this.jumpTimer = 0;
                        this.body.setVelocityY(this.jumpForce);
                        this.body.setVelocityX(this.jumpSpeedX * this.wanderDir);
                        this.wanderJumpsLeft--;
                        if (this.wanderJumpsLeft <= 0) {
                            this.wanderState = 'resting';
                            this.wanderRestTimer = 0;
                        }
                    }
                    break;
                case 'resting':
                    this.wanderRestTimer += delta;
                    if (this.wanderRestTimer >= 3000) this._rollWanderAction();
                    break;
            }
        }
    }

    takeDamage(amount, srcX, srcY) {
        if (this.hp <= 0) return;
        this.hp -= amount;
        if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this.scene, this.hp <= 0 ? 'SlimeDeath' : 'SlimeHurt');
        this.forceAggroTimer = 5000;

        if (srcX !== undefined) {
            let d = this.x >= srcX ? 1 : -1;
            this.body.setVelocity(d * 250, -150);
            this.knockbackTimer = 300;
        }

        this.setTint(0xff0000);
        this.scene.time.delayedCall(120, () => {
            if (this.hp > 0) this.clearTint();
        });

        // 受伤动画
        if (this.hp > 0 && this.scene.anims.exists('slime_injured')) {
            this.play('slime_injured', true);
        }

        if (this.hp <= 0) {
            this.scene.events.emit('monster_killed', this.x, this.y, this.isMini ? 0.025 : 0.05);
            this.setTint(0x444444);
            this.body.setVelocityY(-200);
            this.body.setVelocityX(Phaser.Math.Between(-80, 80));
            // 死亡动画
            if (this.scene.anims.exists('slime_dead')) {
                this.play('slime_dead', true);
            }
            if (!this.isMini) {
                this.scene.time.delayedCall(150, () => {
                    if (this.scene) this.scene.events.emit('slime_split', this.x, this.y);
                });
            }
            this.scene.time.delayedCall(400, () => { if (this.scene) this.destroy(); });
        }
    }
}