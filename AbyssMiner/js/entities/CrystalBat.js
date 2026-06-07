/**
 * 水晶蝙蝠 (Crystal Bat) HP=6
 * 倒挂 → 玩家进入600px → 缓慢靠近 → 100px内蓄力0.5s（黄色）→ 冲刺0.5s
 * → 撞墙/撞人/超时 → 急刹车硬直0.3s → 撤退3s → 再靠近
 * 攻击伤害：只有 dashing 状态才扣玩家血
 */
class CrystalBat extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        super(scene, x, y, 'bat_img');
        scene.add.existing(this);
        scene.physics.add.existing(this);
        this.body.setSize(26,14); this.body.setOffset(3,5);
        this.body.setAllowGravity(false);
        this.setCollideWorldBounds(true);
        this.setFlipY(true);

        if (scene.walls) scene.physics.add.collider(this, scene.walls);
        this.setBounce(0.4);

        this.state = 'hanging';
        this.hp = 6;
        this.homeX = x; this.homeY = y;
        this.knockbackTimer = 0;
        this.forceAggroTimer = 0;

        this.baseSpeed = 80;
        this.aggroSpeed = 120;
        this.dashSpeed = 480;

        this.irregTimer = 0;
        this.irregInterval = 0;
        this.chargeTimer = 0;
        this.dashTimer = 0;
        this.retreatTimer = 0;
        this.wanderTimer = 0;
        this.attackCD = 0;
        this.dashTargetX = 0; this.dashTargetY = 0;
    }

    canDamagePlayer() { return this.state === 'dashing'; }

    _randomizeVelocity(baseVx, baseVy, speed) {
        let baseAngle = Math.atan2(baseVy, baseVx);
        let randAngle = baseAngle + (Math.random() - 0.5) * (Math.PI / 1.8);
        this.body.setVelocity(Math.cos(randAngle) * speed, Math.sin(randAngle) * speed);
        this.irregTimer = 0;
        this.irregInterval = Phaser.Math.Between(200, 450);
    }

    update(time, delta, player) {
        if (this.hp <= 0) return;
        if (this.knockbackTimer > 0) { this.knockbackTimer -= delta; return; }
        if (this.forceAggroTimer > 0) this.forceAggroTimer -= delta;

        if (this.scene.walls) this.scene.physics.collide(this, this.scene.walls);

        this.attackCD = Math.max(0, this.attackCD - delta);
        let dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
        let toPx = player.x - this.x, toPy = player.y - this.y;
        let len = Math.sqrt(toPx*toPx+toPy*toPy)||1;

        switch(this.state) {
            case 'hanging':
                this.body.setVelocity(0,0);
                this.setFlipY(true);
                if (dist < 600 || this.forceAggroTimer > 0) { this.state='approaching'; this.irregTimer=0; this.irregInterval=0; }
                break;
            case 'approaching':
                this.setFlipY(false);
                if (dist > 650 && this.forceAggroTimer <= 0) { this.state='wandering'; this.wanderTimer=0; break; }
                if (this.attackCD > 0) {
                    this.irregTimer += delta;
                    if (this.irregTimer >= this.irregInterval)
                        this._randomizeVelocity(toPx/len, toPy/len, this.aggroSpeed * 0.6);
                    break;
                }
                if (dist <= 120) {
                    this.state = 'charging';
                    this.chargeTimer = 0;
                    this.dashTargetX = player.x;
                    this.dashTargetY = player.y;
                    this.body.setVelocity(0,0);
                    this.setTint(0xffff00);
                    break;
                }
                // 高度限制：保持在玩家头上 1.5 格以上
                {
                    const G = 32;
                    const heightAbove = player.y - this.y;  // 蝙蝠 y < 玩家 y → 在上方 → heightAbove > 0
                    // 进入避险（蝙蝠太接近玩家高度）— 距玩家垂直距离 < 1.5 格
                    if (heightAbove < 1.5 * G) {
                        // 进入"逃高"模式：随机方向但 vy 向上 + x 朝玩家靠近
                        this._fleeingHeight = true;
                    }
                    if (heightAbove >= 3 * G) {
                        // 距离够远 → 恢复正常 approaching
                        this._fleeingHeight = false;
                    }
                    if (this._fleeingHeight) {
                        // x 朝玩家方向，y 强制向上（飞高）
                        this.irregTimer += delta;
                        if (this.irregTimer >= this.irregInterval) {
                            const dirX = (player.x > this.x) ? 1 : -1;
                            const baseVx = dirX * (0.5 + Math.random() * 0.5);  // 0.5~1.0 向玩家
                            const baseVy = -1 - Math.random() * 0.5;  // -1.5~-1.0 向上
                            const baseLen = Math.sqrt(baseVx * baseVx + baseVy * baseVy);
                            this.body.setVelocity(
                                (baseVx / baseLen) * this.aggroSpeed,
                                (baseVy / baseLen) * this.aggroSpeed
                            );
                            this.irregTimer = 0;
                            this.irregInterval = Phaser.Math.Between(200, 450);
                        }
                        break;
                    }
                }
                this.irregTimer += delta;
                if (this.irregTimer >= this.irregInterval)
                    this._randomizeVelocity(toPx/len, toPy/len, this.aggroSpeed);
                break;
            case 'charging':
                this.chargeTimer += delta;
                if (this.chargeTimer >= 500) {
                    this.state = 'dashing';
                    this.dashTimer = 0;
                    this.clearTint();
                    let da = Phaser.Math.Angle.Between(this.x, this.y, this.dashTargetX, this.dashTargetY);
                    this.body.setVelocity(Math.cos(da)*this.dashSpeed, Math.sin(da)*this.dashSpeed);
                }
                break;
            case 'dashing':
                this.dashTimer += delta;
                let hitPlayer = this.scene.physics.overlap(this, player);
                let hitWall = !this.body.blocked.none || this.body.touching.up || this.body.touching.down || this.body.touching.left || this.body.touching.right;
                if (hitWall || hitPlayer || this.dashTimer >= 500) {
                    this.state = 'dash_brake';
                    this.dashTimer = 0;
                    if (hitPlayer) {
                        let bounceX = this.x > player.x ? 80 : -80;
                        this.body.setVelocity(bounceX, -60);
                    } else if (hitWall) {
                        this.body.velocity.x *= -0.5;
                        this.body.velocity.y *= -0.5;
                    } else {
                        this.body.setVelocity(0, 0);
                    }
                }
                break;
            case 'dash_brake':
                this.dashTimer += delta;
                this.body.velocity.x *= 0.85;
                this.body.velocity.y *= 0.85;
                if (this.dashTimer >= 300) {
                    this.state = 'retreating';
                    this.retreatTimer = 0;
                    this.attackCD = 5000;
                    this.irregTimer = 0;
                    this.irregInterval = 0;
                }
                break;
            case 'retreating':
                this.retreatTimer += delta;
                if (this.retreatTimer >= 3000) { this.state='approaching'; this.irregTimer=0; this.irregInterval=0; break; }
                this.irregTimer += delta;
                if (this.irregTimer >= this.irregInterval)
                    this._randomizeVelocity(-toPx/len, -toPy/len, this.aggroSpeed * 0.7);
                break;
            case 'wandering':
                this.wanderTimer += delta;
                if (dist < 600 || this.forceAggroTimer > 0) { this.state='approaching'; this.irregTimer=0; this.irregInterval=0; break; }
                this.irregTimer += delta;
                if (this.irregTimer >= this.irregInterval)
                    this._randomizeVelocity(Math.cos(Math.random()*Math.PI*2), Math.sin(Math.random()*Math.PI*2), this.baseSpeed);
                if (this.wanderTimer >= 10000) this.state='returning';
                break;
            case 'returning':
                let homeAngle = Phaser.Math.Angle.Between(this.x,this.y,this.homeX,this.homeY);
                this.body.setVelocity(Math.cos(homeAngle)*200, Math.sin(homeAngle)*200);
                if (Phaser.Math.Distance.Between(this.x,this.y,this.homeX,this.homeY) < 20) {
                    this.x=this.homeX; this.y=this.homeY;
                    this.body.setVelocity(0,0);
                    this.state='hanging';
                }
                break;
        }

        if (this.state!=='hanging') {
            if (this.body.velocity.x < -5) this.setFlipX(true);
            else if (this.body.velocity.x > 5) this.setFlipX(false);
        }

        this._updateAnim();
    }

    takeDamage(amount, srcX, srcY) {
        if (this.hp<=0) return;
        this.hp-=amount;
        if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this.scene, this.hp <= 0 ? 'BatDeath' : 'BatHurt');
        this.forceAggroTimer = 5000;
        if (srcX!==undefined){
            let d=this.x>=srcX?1:-1;
            this.body.setVelocity(d*200,-100);
            this.knockbackTimer=240;
        }
        this.setTint(0xff0000); // 受击红
        this.scene.time.delayedCall(120,()=>{
            if(this.hp>0) {
                if (this.state === 'charging') this.setTint(0xffff00); // 蓄力中恢复黄
                else this.clearTint();
            }
        });
        if (this.hp<=0) {
            this.scene.events.emit('monster_killed', this.x, this.y, 0.1);
            this.setTint(0x444444); this.body.setVelocity(Phaser.Math.Between(-80,80),120);
            this.body.setAllowGravity(true);
            // 死亡动画 (3 帧 once, 自动停最后一帧)
            if (this.scene.anims.exists('bat_dead')) this.play('bat_dead');
            this._lastAnimKey = 'bat_dead';
            this.scene.time.delayedCall(500,()=>{if(this.scene)this.destroy();});
        }
    }

    /** state → anim mapping (knockback / dead 优先级最高) */
    _updateAnim() {
        if (this.hp <= 0) return;  // 死亡时不切 anim
        let key, flipY;
        if (this.knockbackTimer > 0) {
            key = 'bat_injuried';
            flipY = false;
        } else if (this.state === 'hanging') {
            key = 'bat_idle';
            flipY = true;  // 倒挂
        } else if (this.state === 'charging' || this.state === 'dashing') {
            key = 'bat_attack';
            flipY = false;
        } else {
            key = 'bat_fly';  // approaching/retreating/wandering/returning/dash_brake
            flipY = false;
        }
        if (key !== this._lastAnimKey) {
            this._lastAnimKey = key;
            if (this.scene.anims.exists(key)) this.play(key);
        }
        this.setFlipY(flipY);
    }
}