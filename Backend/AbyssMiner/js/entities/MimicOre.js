/**
 * 拟态矿石 (Mimic Ore) HP=18 - 蓝色伪装
 * 静止伪装 → 玩家近战或铁镐击中 → 1秒出土 → 追击玩家
 * 【新增攻击】靠近玩家 15px → 停下蓄力 0.5s（黄色）→ 30px 范围伤害（爱心一样的范围特效）→ 5秒 cd
 * 超出 700px → 1秒埋土 → 重新伪装
 * 攻击玩家伤害：只有 attacking 状态（生成范围特效那一瞬间）才扣血
 */
class MimicOre extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        super(scene, x, y, 'mimic_ore_img');
        scene.add.existing(this); scene.physics.add.existing(this);
        this.body.setSize(20,20); this.body.setOffset(2,2);
        this.body.setAllowGravity(true);
        this.body.setImmovable(false);
        this.setGravityY(1750);
        this.state='disguised'; this.hp=18;
        this.baseSpeed=85;
        this.forceAggroTimer = 0;
        this.setTint(0x3399ff); // 蓝色伪装
        this.setScale(0.9);
        this.isRevealing=false;

        // 攻击相关
        this.attackCD = 0;
        this.chargeTimer = 0;
    }

    canDamagePlayer() { return this.state === 'attacking'; }

    onHit() {
        if (this.state!=='disguised') return;
        this.state='emerging';
        this.isRevealing=true;
        this.setTint(0xff8800);
        this.scene.tweens.add({
            targets: this,
            scaleX: 1.4, scaleY: 1.4,
            duration: 500, yoyo: false,
            onComplete: () => {
                this.scene.tweens.add({
                    targets: this,
                    scaleX: 1.0, scaleY: 1.0,
                    duration: 500,
                    onComplete: () => {
                        this.state='chasing';
                        this.clearTint(); this.setTint(0xff4400);
                        this.isRevealing=false;
                    }
                });
            }
        });
        this.scene.time.delayedCall(1000, () => {
            if (this.scene && this.state==='emerging') {
                this.state='chasing'; this.clearTint(); this.setTint(0xff4400); this.isRevealing=false;
            }
        });
    }

    update(time, delta, player) {
        if (this.hp<=0) return;
        if (this.forceAggroTimer > 0) this.forceAggroTimer -= delta;
        if (this.attackCD > 0) this.attackCD -= delta;

        let dist = Phaser.Math.Distance.Between(this.x,this.y,player.x,player.y);
        let onGround = this.body.blocked.down||this.body.touching.down;

        if (this.state==='chasing') {
            let dir = player.x>this.x ? 1 : -1;
            this.body.setVelocityX(dir * this.baseSpeed);
            this.setFlipX(dir<0);
            // 播放跑动动画
            if (this.scene.anims.exists('mimic_ore_run') && this.anims.currentAnim?.key !== 'mimic_ore_run') {
                this.play('mimic_ore_run');
            }

            // 距离 <=40px 且 cd 好了：进入蓄力攻击
            if (dist <= 40 && this.attackCD <= 0) {
                this.state = 'charging';
                this.chargeTimer = 0;
                this.body.setVelocityX(0);
                this.setTint(0xffff00); // 黄色蓄力
                return;
            }

            if (dist > 700 && this.forceAggroTimer <= 0) {
                this.state='burying';
                this.body.setVelocity(0,0);
                this.body.setAllowGravity(false);
                this.buryX = this.x; this.buryY = this.y;
                this.scene.tweens.add({
                    targets: this,
                    scaleX: 0, scaleY: 0, alpha: 0,
                    duration: 1000,
                    onComplete: () => {
                        if (!this.scene) return;
                        this.state='disguised';
                        this.x = this.buryX; this.y = this.buryY;
                        this.body.setAllowGravity(true);
                        this.setTint(0x3399ff); // 蓝色
                        this.setScale(0.9); this.setAlpha(1);
                    }
                });
            }
        } else if (this.state === 'charging') {
            this.body.setVelocityX(0);
            this.chargeTimer += delta;
            if (this.chargeTimer >= 500) {
                // 蓄力完成 → 攻击瞬间（生成范围特效 + 该帧能伤害玩家）
                this.state = 'attacking';
                this.clearTint();
                this.setTint(0xff4400);
                // 范围特效 (60px 伤害范围)
                let fx = this.scene.add.graphics();
                if (this.scene.uiCam) this.scene.uiCam.ignore(fx);
                fx.lineStyle(3, 0xff4400, 1);
                fx.strokeCircle(this.x, this.y, 60);
                fx.fillStyle(0xff4400, 0.3);
                fx.fillCircle(this.x, this.y, 60);
                this.scene.tweens.add({
                    targets: fx, alpha: 0, duration: 400,
                    onComplete: () => fx.destroy()
                });
                // attacking 状态只持续 100ms（攻击瞬间能伤害），然后进入 cd
                this.scene.time.delayedCall(100, () => {
                    if (this.scene && this.hp > 0 && this.state === 'attacking') {
                        this.state = 'chasing';
                        this.attackCD = 5000;
                    }
                });
            }
        } else if (this.state==='disguised') {
            this.body.setVelocityX(0);
        } else if (this.state==='emerging'||this.state==='burying'||this.state==='attacking') {
            this.body.setVelocity(0,0);
        }
    }

    /** 检测玩家是否在 60px 攻击范围内（GameScene 调用） */
    isPlayerInAttackRange(player) {
        return this.state === 'attacking' &&
               Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y) <= 60;
    }

    takeDamage(amount) {
        if (this.hp<=0) return;
        if (this.state==='disguised') { this.onHit(); return; }
        this.hp-=amount;
        this.forceAggroTimer = 5000;
        // 受击红色闪烁（不击退）
        this.setTint(0xff0000);
        this.scene.time.delayedCall(120,()=>{
            if(this.hp>0 && this.state!=='disguised') {
                if (this.state === 'charging') this.setTint(0xffff00);
                else this.setTint(0xff4400);
            }
        });
        if (this.hp<=0) {
            this.scene.events.emit('monster_killed', this.x, this.y, 1);
            this.setTint(0x444444); this.body.setVelocityY(-150);
            this.scene.time.delayedCall(500,()=>{if(this.scene)this.destroy();});
        }
    }
}
/**
 * 胆小拟态矿 (Coward Mimic Ore) HP=18
 * 静止伪装（紫色）→ 玩家近战或铁镐击中 → 1秒出土 → 远离玩家逃跑
 * 脱离警戒范围（>700px）后 → 1秒埋土 → 重新伪装
 * 永远不主动攻击玩家。被攻击只会逃跑。
 */
class CowardMimicOre extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        super(scene, x, y, 'mimic_ore_img');
        scene.add.existing(this); scene.physics.add.existing(this);
        this.body.setSize(20, 20); this.body.setOffset(2, 2);
        this.body.setAllowGravity(true);
        this.body.setImmovable(false);
        this.setGravityY(1750);
        this.state = 'disguised'; this.hp = 18;
        this.fleeSpeed = 100; // 逃跑速度
        this.forceAggroTimer = 0;
        this.setTint(0xaa55ff); // 紫色伪装（区别于蓝色攻击型）
        this.setScale(0.9);
        this.isRevealing = false;
    }

    /** 永远不会伤害玩家 */
    canDamagePlayer() { return false; }

    /** 被攻击触发出土（只有 disguised 状态会触发）*/
    onHit() {
        if (this.state !== 'disguised') return;
        this.state = 'emerging';
        this.isRevealing = true;
        this.setTint(0xcc88ff); // 浅紫
        this.scene.tweens.add({
            targets: this,
            scaleX: 1.4, scaleY: 1.4,
            duration: 500, yoyo: false,
            onComplete: () => {
                this.scene.tweens.add({
                    targets: this,
                    scaleX: 1.0, scaleY: 1.0,
                    duration: 500,
                    onComplete: () => {
                        this.state = 'fleeing';
                        this.clearTint(); this.setTint(0xaa55ff);
                        this.isRevealing = false;
                    }
                });
            }
        });
        this.scene.time.delayedCall(1000, () => {
            if (this.scene && this.state === 'emerging') {
                this.state = 'fleeing'; this.clearTint(); this.setTint(0xaa55ff); this.isRevealing = false;
            }
        });
    }

    update(time, delta, player) {
        if (this.hp <= 0) return;
        if (this.forceAggroTimer > 0) this.forceAggroTimer -= delta;

        let dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

        if (this.state === 'fleeing') {
            // 朝远离玩家方向跑
            let fleeDir = player.x > this.x ? -1 : 1;
            this.body.setVelocityX(fleeDir * this.fleeSpeed);
            this.setFlipX(fleeDir < 0);

            // 撞墙就上下尝试方向（实际就是被墙挡住停下，等会再尝试）
            if (this.body.blocked.left || this.body.blocked.right) {
                this.body.setVelocityX(0);
            }

            // 脱离警戒范围 → 埋土
            if (dist > 700 && this.forceAggroTimer <= 0) {
                this.state = 'burying';
                this.body.setVelocity(0, 0);
                this.body.setAllowGravity(false);
                this.buryX = this.x; this.buryY = this.y;
                this.scene.tweens.add({
                    targets: this,
                    scaleX: 0, scaleY: 0, alpha: 0,
                    duration: 1000,
                    onComplete: () => {
                        if (!this.scene) return;
                        this.state = 'disguised';
                        this.x = this.buryX; this.y = this.buryY;
                        this.body.setAllowGravity(true);
                        this.setTint(0xaa55ff); // 紫色伪装
                        this.setScale(0.9); this.setAlpha(1);
                    }
                });
            }
        } else if (this.state === 'disguised') {
            this.body.setVelocityX(0);
        } else if (this.state === 'emerging' || this.state === 'burying') {
            this.body.setVelocity(0, 0);
        }
    }

    takeDamage(amount) {
        if (this.hp <= 0) return;
        if (this.state === 'disguised') { this.onHit(); return; }
        this.hp -= amount;
        this.forceAggroTimer = 5000;
        // 受击红色闪烁（不击退，胆小型保留这个原版特性）
        this.setTint(0xff0000);
        this.scene.time.delayedCall(120, () => {
            if (this.hp > 0 && this.state !== 'disguised') {
                this.setTint(0xaa55ff); // 恢复紫色
            }
        });
        if (this.hp <= 0) {
            this.scene.events.emit('monster_killed', this.x, this.y, 1);
            this.setTint(0x444444); this.body.setVelocityY(-150);
            this.scene.time.delayedCall(500, () => { if (this.scene) this.destroy(); });
        }
    }
}