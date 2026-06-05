/**
 * 水晶垂丝蛛 (Crystal Bungee Spider)
 * 悬挂 → 加速下落 → 减速 → 弹起 → 蛛丝断裂 → 自由落体 → 地面行走
 * 接近地面 (<=150px) 时提早上升，上升距离 = 已下落距离 / 3
 * 蓄力期间黄色，攻击中（pounce）才扣玩家血
 */
class CrystalBungeeSpider extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        const tex = scene.textures.exists('Small_spider_fall') ? 'Small_spider_fall' : 'bungee_spider_img';
        super(scene, x, y, tex);
        scene.add.existing(this);
        scene.physics.add.existing(this);

        if (tex === 'Small_spider_fall') {
            this.setScale(1.0);
        }
        // hitbox：纹理 32x32 × scale 1.0 = 世界 32x32（一格）
        this.body.setSize(32, 32);
        this.body.setCollideWorldBounds(true);
        this.body.setAllowGravity(false);

        this.state = 'idle';
        this.hp = 4;
        this.anchorX = x;
        this.anchorY = y;
        this.maxDrop = Phaser.Math.Between(220, 380);
        this.silkIntact = true;

        this.dir = 1;
        this.moveSpeed = 55;
        this.timer = 0;
        this.actionTimer = 0;
        this.isClimbing = false;
        this.forceAggroTimer = 0;
        this.attackCD = 0;

        this.earlyBounce = false;
        this.earlyBounceTargetY = 0;

        this._lastAnimKey = null;
        // 默认 idle 显示 run 第一帧（不动）
        if (scene.anims.exists('small_spider_run')) {
            this.play('small_spider_run');
            this._lastAnimKey = 'small_spider_run';
        }
    }

    _playAnim(key) {
        if (!this.scene || !this.scene.anims.exists(key)) return;
        if (this._lastAnimKey === key) return;
        this._lastAnimKey = key;
        this.play(key);
    }

    canDamagePlayer() {
        // 蛛丝阶段（dropping/bouncing）一直能伤害；地面阶段只有 pounce / cling_attack 才能
        return this.state === 'dropping' || this.state === 'bouncing' ||
               this.state === 'pounce' || this.state === 'cling_attack';
    }

    _uncount() {
        if (this._isCounted) {
            this._isCounted = false;
            if (this.scene && this.scene._clingingSpiderCount) {
                this.scene._clingingSpiderCount = Math.max(0, this.scene._clingingSpiderCount - 1);
            }
        }
    }

    update(time, delta, player) {
        if (this.hp <= 0) return;
        if (this.forceAggroTimer > 0) this.forceAggroTimer -= delta;

        let distToPlayer = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

        if (this.state === 'idle') {
            this.body.setVelocity(0, 0);
            this.y = this.anchorY;
            if ((distToPlayer < 600 || this.forceAggroTimer > 0) && player.y > this.anchorY + 30) {
                this.state = 'dropping';
                this.body.setAllowGravity(true);
                this.body.setGravityY(3800);
            }
            return;
        }

        if (this.state === 'dropping') {
            let dropDist = this.y - this.anchorY;
            let progress = dropDist / this.maxDrop;

            let groundDist = Infinity;
            if (this.scene && this.scene.wallRects) {
                for (let w of this.scene.wallRects) {
                    if (this.x >= w.left - 5 && this.x <= w.right + 5 && w.top > this.y) {
                        let d = w.top - this.y;
                        if (d < groundDist) groundDist = d;
                    }
                }
            }
            if (groundDist <= 150) {
                this.earlyBounce = true;
                this.earlyBounceTargetY = this.y - (dropDist / 3);
                this.body.setAllowGravity(false);
                this.body.setGravityY(0);
                this.body.setVelocityY(-250);
                this.state = 'bouncing';
                return;
            }

            if (progress > 0.70) {
                this.body.velocity.y = Phaser.Math.Linear(this.body.velocity.y, 0, 0.10);
                this.body.setGravityY(0);
            }
            if (dropDist >= this.maxDrop || (progress > 0.85 && Math.abs(this.body.velocity.y) < 15)) {
                this.earlyBounce = false;
                this.body.setAllowGravity(false);
                this.body.setGravityY(0);
                this.body.setVelocityY(-250);
                this.state = 'bouncing';
            }
            return;
        }

        if (this.state === 'bouncing') {
            if (this.earlyBounce) {
                if (this.y <= this.earlyBounceTargetY || this.body.velocity.y >= 0) {
                    this.silkIntact = false;
                    this.body.setAllowGravity(true);
                    this.body.setGravityY(0);
                    this.body.setVelocityY(0);
                    this.state = 'falling';
                }
                return;
            }
            if (this.body.velocity.y >= -10 || this.y <= this.anchorY + 200) {
                this.silkIntact = false;
                this.body.setAllowGravity(true);
                this.body.setGravityY(0);
                this.body.setVelocityY(0);
                this.state = 'falling';
            }
            return;
        }

        if (this.state === 'falling') {
            let onGround = this.body.blocked.down || this.body.touching.down;
            if (onGround) {
                this.state = 'wander';
                this.dir = Math.random() > 0.5 ? 1 : -1;
                this.actionTimer = Phaser.Math.Between(800, 1800);
            }
            return;
        }

        // 地面阶段
        const G = 32;
        // 4 方向手动检测内缩 1px
        const checkDir = (dirKey) => {
            if (!(this.body.blocked[dirKey] || this.body.touching[dirKey])) return false;
            if (!this.scene || !this.scene.wallRects) return true;
            let cl, cr, ct, cb;
            if (dirKey === 'up')    { cl = this.body.left + 1;  cr = this.body.right - 1; ct = this.body.top - 1;    cb = this.body.top - 1; }
            if (dirKey === 'down')  { cl = this.body.left + 1;  cr = this.body.right - 1; ct = this.body.bottom + 1; cb = this.body.bottom + 1; }
            if (dirKey === 'left')  { cl = this.body.left - 1;  cr = this.body.left - 1;  ct = this.body.top + 1;    cb = this.body.bottom - 1; }
            if (dirKey === 'right') { cl = this.body.right + 1; cr = this.body.right + 1; ct = this.body.top + 1;    cb = this.body.bottom - 1; }
            for (const w of this.scene.wallRects) {
                if (cr >= w.left && cl <= w.right && cb >= w.top && ct <= w.bottom) return true;
            }
            return false;
        };
        let onGround = checkDir('down');
        let onCeiling = checkDir('up');
        let onLeftWall = checkDir('left');
        let onRightWall = checkDir('right');
        let onWall = onLeftWall || onRightWall;
        let dirToPlayer = player.x > this.x ? 1 : -1;

        // === 重新垂吊 (ceiling 状态) ===
        if (this.state === 'ceiling') {
            // 玩家在下方 + X 距离 2 格 → 重新 bungee（垂直下落）
            if (Math.abs(player.x - this.x) <= 2 * G && player.y > this.y + G) {
                this.state = 'bungee_redrop';
                this.body.setAllowGravity(true);
                this.body.setVelocityX(0);
                this.body.setVelocityY(450);
                this.setFlipY(false);
                this._bungeeStartX = this.x;
                this._bungeeStartY = this.y;
                if (!this._bungeeLine) {
                    this._bungeeLine = this.scene.add.graphics();
                    this._bungeeLine.setDepth(9);
                    if (this.scene.uiCam) {
                        try { this.scene.uiCam.ignore(this._bungeeLine); } catch(e) {}
                    }
                }
                return;
            }
            // 沿天花板朝玩家移动（不颠倒）
            this.body.setAllowGravity(false);
            this.setFlipY(false);
            this.body.setVelocityY(0);
            this.body.setVelocityX(dirToPlayer * this.moveSpeed * 1.5);
            if (!onCeiling) {
                this.state = 'chase';
                this.body.setAllowGravity(true);
                this.setFlipY(false);
            }
            return;
        }

        if (this.state === 'bungee_redrop') {
            if (this._bungeeLine) {
                this._bungeeLine.clear();
                this._bungeeLine.lineStyle(0.7, 0xffffff, 0.9);
                this._bungeeLine.beginPath();
                this._bungeeLine.moveTo(this._bungeeStartX, this._bungeeStartY);
                this._bungeeLine.lineTo(this.x, this.y);
                this._bungeeLine.strokePath();
            }
            if (onGround || this.scene.physics.overlap(this, player)) {
                this.state = 'wander';
                this.body.setVelocityX(0);
                if (this._bungeeLine) {
                    this._bungeeLine.destroy();
                    this._bungeeLine = null;
                }
            }
            return;
        }

        // === 撞墙/玩家就爬 ===
        const touchingPlayer = this.scene.physics.overlap(this, player);

        if (this.state === 'cling_prepare' || this.state === 'cling_attack' || this.state === 'cling_idle') {
            this.body.setAllowGravity(false);
            this.setFlipY(false);  // 爬玩家身上不颠倒

            // (用户) 玩家死亡 → 立即松手 (否则趴尸体上, 复活后接着咬)
            if (this.scene.isDead || (!touchingPlayer && distToPlayer > 80)) {
                this.state = 'chase';
                this.body.setAllowGravity(true);
                this.setFlipY(false);
                this.clearTint();
                this.isClimbing = false;
                this._uncount();
                return;
            }

            // 朝玩家慢速移动（玩家跑快可甩掉）
            const climbSpd = this.moveSpeed * 1.2;
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            this.body.setVelocityX((dx / len) * climbSpd);
            this.body.setVelocityY((dy / len) * climbSpd);

            this.timer -= delta;
            if (this.state === 'cling_prepare') {
                this.setTint(0xffff00);
                if (this.timer <= 0) {
                    this.state = 'cling_attack';
                    this.timer = 350;
                    this.clearTint();
                }
            } else if (this.state === 'cling_attack') {
                if (this.timer <= 0) {
                    this.state = 'cling_idle';
                    this.timer = 3000;
                }
            } else if (this.state === 'cling_idle') {
                if (this.timer <= 0) {
                    this.state = 'cling_prepare';
                    this.timer = 400;
                }
            }
            return;
        }

        // 撞玩家 → 进 cling_prepare
        if (touchingPlayer && !this.scene.isDead && this.state !== 'pounce' && this.state !== 'prepare' &&
            this.state !== 'cling_prepare' && this.state !== 'cling_attack' && this.state !== 'cling_idle') {
            this.state = 'cling_prepare';
            this.timer = 400;
            this.isClimbing = true;
            this.scene._clingingSpiderCount = (this.scene._clingingSpiderCount || 0) + 1;
            this._isCounted = true;
            return;
        }

        // 蜘蛛爬墙时玩家跑到反方向 → falling 落地（弹一下）
        if (this.isClimbing) {
            const playerOpposite = (this._wallSide === 'left' && player.x > this.x) ||
                                   (this._wallSide === 'right' && player.x < this.x);
            if (playerOpposite) {
                this.isClimbing = false;
                this._climbLostFrames = 0;
                this._wallSide = null;
                this.body.setAllowGravity(true);
                this.body.setVelocity(0, 50);
                this.setFlipY(false);
                this.state = 'falling';
                return;
            }
        }

        // falling 状态：自由落体，落地反弹
        if (this.state === 'falling') {
            this.body.setAllowGravity(true);
            if (onGround) {
                this.body.setVelocityY(-200);
                this.body.setVelocityX(0);
                this.state = 'bouncing';
            }
            return;
        }
        if (this.state === 'bouncing') {
            if (this.body.velocity.y >= 0) {
                this.state = 'wander';
                this.dir = dirToPlayer;
            }
            return;
        }

        // 撞墙正常爬墙（直直向上 vx=0）
        if (onWall && this.state !== 'prepare' && this.state !== 'pounce') {
            if (!this.isClimbing) {
                this.isClimbing = true;
                this._wallSide = onLeftWall ? 'left' : 'right';
            }
            this._climbLostFrames = 0;
            this.body.setAllowGravity(false);
            this.body.setVelocityY(-this.moveSpeed * 2);
            this.body.setVelocityX(0);
            this.setFlipY(false);
            if (onCeiling) {
                this.state = 'ceiling';
                this.isClimbing = false;
                this.body.setVelocityY(0);
                this.setFlipY(false);
            }
            return;
        }

        // 已爬墙但当前 onWall=false → 计数 3 帧
        if (this.isClimbing && !onWall && !onCeiling) {
            this._climbLostFrames = (this._climbLostFrames || 0) + 1;
            if (this._climbLostFrames < 3) {
                this.body.setAllowGravity(false);
                this.body.setVelocityY(-this.moveSpeed * 2);
                this.body.setVelocityX(0);
                return;
            }
            this._climbLostFrames = 0;
            const dirForward = this._wallSide === 'left' ? -1 : 1;
            this.body.setVelocityY(-this.moveSpeed * 0.5);
            this.body.setVelocityX(this.moveSpeed * dirForward);
            this.body.setAllowGravity(true);
            this.isClimbing = false;
            this.state = 'wander';
            this.dir = dirForward;
            this._wallSide = null;
            return;
        }

        if (onCeiling && !onGround) {
            this.state = 'ceiling';
            this.body.setAllowGravity(false);
            this.setFlipY(false);
            return;
        }

        if (this.isClimbing && !onWall && !onCeiling) {
            this.isClimbing = false;
            this.body.setAllowGravity(true);
            this.setFlipY(false);
        }

        if (this.attackCD > 0) this.attackCD -= delta;

        if ((this.state === 'wander' || this.state === 'idle_ground' || this.state === 'chase') && onGround) {
            if (distToPlayer <= 600 || this.forceAggroTimer > 0) {
                if (distToPlayer <= 140 && Math.abs(player.y - this.y) < 100 && this.attackCD <= 0 && !onWall) {
                    this.state = 'prepare';
                    this.timer = 400;
                    this.body.setVelocityX(0);
                    this.setTint(0xffff00);
                } else {
                    this.state = 'chase';
                }
            } else {
                if (this.state === 'chase') {
                    this.state = 'idle_ground';
                    this.actionTimer = 1000;
                }
            }
        }

        switch (this.state) {
            case 'idle_ground':
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
                // 撞墙不反向 — 让爬墙逻辑接管
                if (this.actionTimer <= 0) {
                    this.state = 'idle_ground';
                    this.actionTimer = Phaser.Math.Between(1000, 2000);
                }
                break;
            case 'chase':
                this.dir = dirToPlayer;
                this.body.setVelocityX(this.moveSpeed * 1.5 * this.dir);
                break;
            case 'prepare':
                this.timer -= delta;
                if (this.timer <= 0) {
                    this.state = 'pounce';
                    this.clearTint();
                    this.body.setVelocityY(-350);
                    this.body.setVelocityX(dirToPlayer * 300);
                }
                break;
            case 'pounce':
                if (onGround && this.body.velocity.y >= 0) {
                    this.state = 'cooldown';
                    this.timer = 1200;
                    this.body.setVelocityX(0);
                }
                break;
            case 'cooldown':
                this.timer -= delta;
                if (this.timer <= 0) {
                    this.attackCD = 2000;
                    this.state = distToPlayer <= 300 ? 'chase' : 'idle_ground';
                    this.actionTimer = 1000;
                } else {
                    if (distToPlayer <= 600) {
                        this.body.setVelocityX(dirToPlayer * this.moveSpeed);
                    } else {
                        this.body.setVelocityX(this.moveSpeed * this.dir);
                    }
                }
                break;
        }

        // 根据状态播放动画
        if (this.hp > 0) {
            if (this.state === 'dropping' || this.state === 'bouncing' ||
                this.state === 'falling' || this.state === 'bungee_redrop') {
                this._playAnim('small_spider_fall');
            } else if (this.state === 'prepare' || this.state === 'pounce' ||
                       this.state === 'cling_prepare' || this.state === 'cling_attack') {
                this._playAnim('small_spider_attack');
            } else {
                this._playAnim('small_spider_run');
            }
            if (this.body.velocity.x > 5) this.setFlipX(false);
            else if (this.body.velocity.x < -5) this.setFlipX(true);
        }
    }

    drawSilk(graphics) {
        if (!this.silkIntact || this.hp <= 0) return;
        if (this.state === 'idle' || this.state === 'dropping' || this.state === 'bouncing') {
            graphics.lineStyle(1.5, 0xccccff, 0.75);
            graphics.beginPath();
            graphics.moveTo(this.anchorX, this.anchorY);
            graphics.lineTo(this.x, this.y);
            graphics.strokePath();
        }
    }

    takeDamage(amount, srcX, srcY) {
        if (this.hp <= 0) return;
        this.hp -= amount;
        this.forceAggroTimer = 5000;
        if (srcX !== undefined) {
            let d = this.x >= srcX ? 1 : -1;
            this.body.setAllowGravity(true);
            this.body.setGravityY(0);
            this.body.setVelocity(d * 250, -100);
        }
        this.setTint(0xff0000);
        if (this.hp > 0 && this.scene.anims.exists('small_spider_injured')) {
            this._lastAnimKey = 'small_spider_injured';
            this.play('small_spider_injured');
            this.once('animationcomplete-small_spider_injured', () => {
                this._lastAnimKey = null;
            });
        }
        this.scene.time.delayedCall(120, () => {
            if (this.hp > 0) {
                if (this.state === 'prepare') this.setTint(0xffff00);
                else this.clearTint();
            }
        });
        if (this.hp <= 0) {
            this._uncount();
            this.scene.events.emit('monster_killed', this.x, this.y, 0.1);
            this.setTint(0x555555);
            this.body.setAllowGravity(true);
            this.body.setGravityY(0);
            this.body.checkCollision.none = true;
            this.body.setVelocityY(-180);
            this.body.setVelocityX(Phaser.Math.Between(-100, 100));
            if (this.scene.anims.exists('small_spider_dead')) {
                this._lastAnimKey = 'small_spider_dead';
                this.play('small_spider_dead');
            }
            this.scene.time.delayedCall(500, () => {
                if (this._bungeeLine) {
                    this._bungeeLine.destroy();
                    this._bungeeLine = null;
                }
                if (this.scene) this.destroy();
            });
        }
    }
}