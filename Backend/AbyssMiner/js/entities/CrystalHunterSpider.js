/**
 * 水晶猎蛛 (Crystal Hunter Spider) v2
 * 地面突击手。爬墙能力。蓄力后跳跃攻击。
 * 蓄力期间变黄色。攻击中（pounce）才会扣玩家血。
 */
class CrystalHunterSpider extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        // 优先用动画图，否则 fallback 到生成的紫色矩形
        const tex = scene.textures.exists('Small_spider_run') ? 'Small_spider_run' : 'spider_img';
        super(scene, x, y, tex);
        scene.add.existing(this);
        scene.physics.add.existing(this);

        // 图片 64x64 → scale 1.0 → 显示 64x64
        if (tex === 'Small_spider_run') {
            this.setScale(1.0);
        }
        // hitbox：纹理 32x32 × scale 1.0 = 世界 32x32（一格）
        this.body.setSize(32, 32);
        this.body.setCollideWorldBounds(true);

        this.state       = 'wander';
        this.hp          = 6;
        this.dir         = 1;
        this.moveSpeed   = 60;
        this.timer       = 0;
        this.actionTimer = 0;
        this.isClimbing  = false;
        this.knockbackTimer = 0;
        this.attackCD = 0;
        this.forceAggroTimer = 0;
        this._lastAnimKey = null;

        // 默认播 run 动画
        if (scene.anims.exists('small_spider_run')) {
            this.play('small_spider_run');
            this._lastAnimKey = 'small_spider_run';
        }
    }

    /** 切换动画（避免重复 play 造成重置）*/
    _playAnim(key) {
        if (!this.scene || !this.scene.anims.exists(key)) return;
        if (this._lastAnimKey === key) return;
        this._lastAnimKey = key;
        this.play(key);
    }

    /** 当前状态是否能伤害玩家（只有 pounce 才行）*/
    canDamagePlayer() { return this.state === 'pounce' || this.state === 'cling_attack'; }

    _uncount() {
        if (this._isCounted) {
            this._isCounted = false;
            if (this.scene && this.scene._clingingSpiderCount) {
                this.scene._clingingSpiderCount = Math.max(0, this.scene._clingingSpiderCount - 1);
            }
        }
    }

    preDestroy() {
        this._uncount();   // (用户) 任何销毁路径都松手, 防 cling 计数永久卡住 → 永久扣血/减速
        if (this._bungeeLine) { this._bungeeLine.destroy(); this._bungeeLine = null; }
        super.preDestroy();
    }

    update(time, delta, player) {
        if (this.hp <= 0) return;
        if (this.knockbackTimer > 0) { this.knockbackTimer -= delta; return; }
        if (this.forceAggroTimer > 0) this.forceAggroTimer -= delta;

        const G = 32;
        // 4 方向都手动检测：触发后用 wallRects 验证（向内缩 1px 避免墙角误判）
        const checkDir = (dirKey) => {
            const _flag = this.body.blocked[dirKey] || this.body.touching[dirKey];
            // (用户) 'down' 不依赖 arcade flag: 单向平台只挡"正在下落"的物体, spider 水平滑过平台顶 / pounce 关重力时
            //   blocked.down 不触发 → 误判空中 → pounce 永不结束卡帧滑行. 改纯几何: 底边贴住任意 wallRect 顶(含平台)即落地.
            if (dirKey !== 'down' && !_flag) return false;
            if (!this.scene || !this.scene.wallRects) return _flag;
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
        const onGround   = checkDir('down');
        const onCeiling  = checkDir('up');
        const onLeftWall = checkDir('left');
        const onRightWall= checkDir('right');
        const onWall     = onLeftWall || onRightWall;
        const distToPlayer = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
        const dirToPlayer  = player.x > this.x ? 1 : -1;

        // === 1) bungee_drop 状态最优先 ===
        if (this.state === 'bungee_drop') {
            if (this._bungeeLine) {
                this._bungeeLine.clear();
                this._bungeeLine.lineStyle(0.7, 0xffffff, 0.9);
                this._bungeeLine.beginPath();
                this._bungeeLine.moveTo(this._bungeeStartX, this._bungeeStartY);
                this._bungeeLine.lineTo(this.x, this.y);
                this._bungeeLine.strokePath();
            }
            if (onGround || this.scene.physics.overlap(this, player)) {
                this.state = 'cooldown';
                this.timer = 1500;
                this.body.setVelocityX(0);
                if (this._bungeeLine) {
                    this._bungeeLine.destroy();
                    this._bungeeLine = null;
                }
            }
            return;
        }

        // === 2) ceiling 状态：在天花板倒挂走 ===
        if (this.state === 'ceiling') {
            // 触发 bungee：玩家在下方 + X 距离 2 格内
            if (Math.abs(player.x - this.x) <= 2 * G && player.y > this.y + G) {
                this.state = 'bungee_drop';
                this.body.setAllowGravity(true);
                this.body.setVelocityX(0);
                this.body.setVelocityY(450);
                this.setRotation(0);
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
            // 沿天花板朝玩家 X 移动（不颠倒）
            this.body.setAllowGravity(false);
            this.setFlipY(false);
            this.body.setVelocityY(0);
            this.body.setVelocityX(dirToPlayer * this.moveSpeed * 1.5);
            // 离开天花板 → 退出
            if (!onCeiling) {
                this.state = 'chase';
                this.body.setAllowGravity(true);
                this.setFlipY(false);
            }
            return;
        }

        // === 3) 撞墙/玩家就爬 ===
        const touchingPlayer = this.scene.physics.overlap(this, player);

        // === cling 模式：爬玩家身上 — 朝玩家移动 + 循环 prepare→attack→idle 3s ===
        // 玩家跑得快可以甩掉
        if (this.state === 'cling_prepare' || this.state === 'cling_attack' || this.state === 'cling_idle') {
            this.body.setAllowGravity(false);
            this.setFlipY(false);  // 爬玩家身上不颠倒

            // 玩家走开 → 掉下
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

        // 爬墙 / 爬玩家 — 都进入 climbing
        // 撞玩家 → 进 cling_prepare
        if (touchingPlayer && !this.scene.isDead && this.state !== 'pounce' && this.state !== 'prepare' &&
            this.state !== 'cling_prepare' && this.state !== 'cling_attack' && this.state !== 'cling_idle') {
            this.state = 'cling_prepare';
            this.timer = 400;
            this.isClimbing = true;
            // 计数 +1
            this.scene._clingingSpiderCount = (this.scene._clingingSpiderCount || 0) + 1;
            this._isCounted = true;
            return;
        }

        // 蜘蛛爬墙时玩家跑到反方向 → 落地 (falling 状态，会弹一下)
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

        // falling 状态：自由落体，落地后反弹
        if (this.state === 'falling') {
            this.body.setAllowGravity(true);
            if (onGround) {
                // 落地反弹（参考 BungeeSpider）
                this.body.setVelocityY(-200);
                this.body.setVelocityX(0);
                this.state = 'bouncing';
            }
            return;
        }
        // bouncing：弹到顶后切 wander
        if (this.state === 'bouncing') {
            if (this.body.velocity.y >= 0) {
                this.state = 'wander';
                this.dir = dirToPlayer;
            }
            return;
        }

        // 撞墙时进爬墙（直直向上 vx=0）
        if (onWall && this.state !== 'pounce' && this.state !== 'prepare') {
            if (!this.isClimbing) {
                this.isClimbing = true;
                this._wallSide = onLeftWall ? 'left' : 'right';
            }
            this._climbLostFrames = 0;
            this.body.setAllowGravity(false);
            this.body.setVelocityY(-this.moveSpeed * 2);
            this.body.setVelocityX(0);  // 直直向上
            this.setFlipY(false);
            if (onCeiling) {
                this.state = 'ceiling';
                this.isClimbing = false;
                this.body.setVelocityY(0);
                this.setFlipY(false);
            }
            return;
        }

        // 已爬墙但当前 onWall=false → 计数确认真的爬出（连续 3 帧）
        if (this.isClimbing && !onWall && !onCeiling) {
            this._climbLostFrames = (this._climbLostFrames || 0) + 1;
            if (this._climbLostFrames < 3) {
                // 还没真的爬出 — 继续向上 vx=0
                this.body.setAllowGravity(false);
                this.body.setVelocityY(-this.moveSpeed * 2);
                this.body.setVelocityX(0);
                return;
            }
            // 连续 3 帧无墙 → 真的爬出墙顶
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

        // === 4) 撞天花板（飞行中或刚爬到顶）→ 上天花板 ===
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

        // 攻击冷却倒计时
        if (this.attackCD > 0) this.attackCD -= delta;

        // === 普通地面行动 ===
        if ((this.state === 'wander' || this.state === 'idle' || this.state === 'chase') && onGround) {
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
                    this.state = 'idle';
                    this.actionTimer = 1000;
                }
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
                // 撞墙不反向 — 让爬墙逻辑接管（在 update 顶部）
                if (this.actionTimer <= 0) {
                    this.state = 'idle';
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
                    this.body.setAllowGravity(true);   // (用户修复) 扑击必须有重力会落地 — 否则飞直线/穿平台永不落地 → onGround 永假 → 永久卡 pounce + 无限向前滑
                    this._pounceTime = 0;
                    this.body.setVelocityY(-350);
                    this.body.setVelocityX(dirToPlayer * 300);
                }
                break;
            case 'pounce':
                this._pounceTime = (this._pounceTime || 0) + delta;
                // (用户修复) 落地(含平台几何判定) / 撞墙 / 超时(1200ms 兜底) 任一即结束扑击, 否则永久卡攻击动作 + 无限滑行到撞墙
                if ((onGround && this.body.velocity.y >= 0) || onWall || this._pounceTime >= 1200) {
                    this.state = 'cooldown';
                    this.timer = 1200;
                    this.body.setVelocityX(0);
                    this._pounceTime = 0;
                }
                break;
            case 'cooldown':
                // CD 期间正常移动 — 切回 wander/chase 但记录 attackCD 防止再蓄力
                this.timer -= delta;
                if (this.timer <= 0) {
                    this.attackCD = 2000;  // 攻击冷却 2 秒（防止刚 cooldown 又蓄力）
                    this.state = distToPlayer <= 300 ? 'chase' : 'idle';
                    this.actionTimer = 1000;
                } else {
                    // CD 期间可移动：朝玩家走或随机
                    if (distToPlayer <= 600) {
                        this.body.setVelocityX(dirToPlayer * this.moveSpeed);
                    } else {
                        this.body.setVelocityX(this.moveSpeed * this.dir);
                    }
                }
                break;
        }

        // 根据状态切动画
        if (this.hp > 0) {
            if (this.state === 'prepare' || this.state === 'pounce' ||
                this.state === 'cling_prepare' || this.state === 'cling_attack') {
                this._playAnim('small_spider_attack');
            } else if (this.state === 'bungee_drop' || this.state === 'falling' || this.state === 'bouncing') {
                this._playAnim('small_spider_fall');
            } else {
                this._playAnim('small_spider_run');
            }
            // 朝向（基于 dir 或速度方向）
            if (this.body.velocity.x > 5) this.setFlipX(false);
            else if (this.body.velocity.x < -5) this.setFlipX(true);
        }
    }

    takeDamage(amount, srcX, srcY) {
        if (this.hp <= 0) return;
        this.hp -= amount;
        if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this.scene, this.hp <= 0 ? 'SpiderDeath' : 'SpiderHurt');
        this.forceAggroTimer = 5000;
        if (srcX !== undefined) {
            let d = this.x >= srcX ? 1 : -1;
            this.body.setAllowGravity(true);
            this.body.setVelocity(d * 250, -150);
            this.knockbackTimer = 240;
        }
        // 受击红色闪烁 + 受伤动画
        this.setTint(0xff0000);
        if (this.hp > 0 && this.scene.anims.exists('small_spider_injured')) {
            this._lastAnimKey = 'small_spider_injured';
            this.play('small_spider_injured');
            // 播完后让 update 自动切回正常动画
            this.once('animationcomplete-small_spider_injured', () => {
                this._lastAnimKey = null;  // 强制下一帧 update 重选
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
            this.body.checkCollision.none = true;
            this.body.setVelocityY(-200);
            this.body.setVelocityX(Phaser.Math.Between(-100, 100));
            // 死亡动画
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