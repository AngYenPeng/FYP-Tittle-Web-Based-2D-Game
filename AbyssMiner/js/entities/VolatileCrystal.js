/**
 * 爆裂水晶 (Volatile Crystal) - 绿色
 * 玩家或铁镐靠近时开始闪烁，2 秒后爆炸。
 * 闪烁期间图案规律变大变小（脉动效果）
 * 爆炸伤害半径内的玩家和怪物，能连锁。
 *
 * (用户) 五张行为表全接线: idle=平时循环 / charge=引信期 / injuried=受击 /
 *   explode=引爆 (播完才销毁, 旧版播完同帧 destroy 根本看不见) /
 *   dead=被打死 (3 击安全拆除: 播死亡动画, 不爆炸不波及, 掉落率 0.2)
 *   有新皮时不再罩绿色 tint (表自带配色), 缺皮回退旧占位风格.
 */
class VolatileCrystal extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        const hasSkins = scene.textures.exists('VolatileCrystal_idle');
        super(scene, x, y, hasSkins ? 'VolatileCrystal_idle' : 'volatile_crystal_img');
        scene.add.existing(this); scene.physics.add.existing(this);
        // hitbox 32x32
        this.body.setSize(32, 32); this.body.setOffset(0, 0);
        this.body.setAllowGravity(false); this.body.setImmovable(true);
        // 不用 setDisplaySize — 帧本来就 32×32, 尺寸由 anim 帧驱动

        this.state = 'idle'; this.hp = Math.ceil(3 * (window.AbyssDiff ? AbyssDiff.get().hpMul : 1));   // (用户) 3 击打死 → dead 动画 (melee 对水晶是无参 takeDamage, 一击一滴)
        this.triggerRadius = 110; this.explodeRadius = 140;   // (用户) 爆炸范围翻倍回 140 (动画 scale 引用此值, 自动跟随)
        this.blinkTimer = 0; this.fuseTime = 2000;
        this.fuseTimer = 0; this.hasExploded = false;
        this._dying = false;

        this.killedByDamage = false;

        this._hasSkins = hasSkins;
        // (用户) 仅缺皮时设为绿色 (新表自带配色, 罩 tint 会毁色)
        if (!hasSkins) this.setTint(0x33cc33);
    }

    /** 爆裂水晶引爆中也能伤害玩家（爆炸由 GameScene 处理，这里返回 false 防止 contact 扣血）*/
    canDamagePlayer() { return false; }

    checkProximity(player) {
        if (this.state !== 'idle') return;
        if (Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y) < this.triggerRadius) this.trigger();
    }

    trigger() {
        if (this.state !== 'idle' || this._dying || this.hasExploded) return;
        this.state = 'triggered'; this.fuseTimer = 0;
        if (!this._hasSkins) this.setTint(0x66ff66);
    }

    update(time, delta) {
        if (this.hasExploded) return;
        if (this.state === 'triggered') {
            this.fuseTimer += delta;
            this.blinkTimer += delta;

            // 【脉动效果】fuseTime 内规律变大变小变大变小变大（5个阶段）
            // 每个阶段 fuseTime/5 = 400ms
            let phase = Math.floor(this.fuseTimer / 400) % 2; // 0或1交替
            let phaseProgress = (this.fuseTimer % 400) / 400; // 0~1
            let scale;
            if (phase === 0) {
                // 变大：1.0 → 1.5
                scale = 1.0 + phaseProgress * 0.5;
            } else {
                // 变小：1.5 → 1.0
                scale = 1.5 - phaseProgress * 0.5;
            }
            this.setScale(scale);

            // 颜色闪烁（绿色与亮黄色交替）— (用户) 仅缺皮时; 有皮靠 charge 表自己的画面
            if (!this._hasSkins) {
                let blinkRate = Math.max(60, 400 - (this.fuseTimer / this.fuseTime) * 340);
                if (this.blinkTimer >= blinkRate) {
                    this.blinkTimer = 0;
                    this.tintTopLeft === 0xffff00 ? this.setTint(0x66ff66) : this.setTint(0xffff00);
                }
            }

            if (this.fuseTimer >= this.fuseTime) this.explode();
        }
        this._updateAnim();
    }

    explode() {
        if (this.hasExploded) return;
        this.hasExploded = true;
        // 伤害/连锁/掉落事件立刻发 (handleCrystalExplosion 当场读坐标, 时机与旧版一致)
        // (用户修复) 直接调用场景处理函数 — 旧事件监听只有 GameScene 注册过, SZ1/2/3/4/5 爆炸全是空响 (不扣血/无冲击圈/无连锁)
        if (this.scene.handleCrystalExplosion) this.scene.handleCrystalExplosion(this.x, this.y, this.explodeRadius);
        let dropRate = this.killedByDamage ? 0.2 : 0.0;
        this.scene.events.emit('monster_killed', this.x, this.y, dropRate);
        if (this.body) this.body.enable = false;
        // (用户) 视觉: 播完 explode 表再销毁 — 旧版 play 完同帧 destroy, 爆炸动画从来没人看见过
        if (this.scene.anims.exists('volatile_crystal_explode')) {
            this.clearTint();
            this.setScale((this.explodeRadius * 2) / 32);   // (用户) 爆炸表完整覆盖伤害半径: 帧 32px → 直径 2R, 中心对齐伤害圆心
            this.play('volatile_crystal_explode');
            this.once('animationcomplete-volatile_crystal_explode', () => { if (this.scene && this.active) this.destroy(); });
            this.scene.time.delayedCall(600, () => { if (this.scene && this.active) this.destroy(); });   // 兜底
        } else {
            this.destroy();
        }
    }

    takeDamage() {
        if (this.hasExploded || this._dying) return;
        this.killedByDamage = true;
        this.hp -= 1;
        if (this.hp <= 0) { this._die(); return; }
        this.setTint(0xff5555); // 受击红闪 (有皮也保留, 通用受击反馈)
        this._hitTimer = 240;  // injured anim window
        if (this.scene.anims.exists('volatile_crystal_injuried')) this.play('volatile_crystal_injuried');
        this._lastAnimKey = 'volatile_crystal_injuried';
        this.scene.time.delayedCall(120, () => {
            if (!this.scene || !this.active) return;
            if (this.state !== 'exploded' && !this.hasExploded && !this._dying) {
                this._hasSkins ? this.clearTint() : this.setTint(0x66ff66);
            }
        });
        this.trigger();
    }

    /** (用户) 被打死 (hp 0): 安全拆除 — dead 动画定格末帧后淡出, 不爆炸不波及; 掉落率 0.2 */
    _die() {
        if (this._dying || this.hasExploded) return;
        this._dying = true;
        this.hasExploded = true;   // 复用守卫: 停 update/近接触发, 连锁也炸不响一具尸体
        if (this.body) this.body.enable = false;
        this.clearTint();
        this.setScale(1.0);
        this.scene.events.emit('monster_killed', this.x, this.y, 0.2);
        if (this.scene.anims.exists('volatile_crystal_dead')) {
            this.y += 16;   // (用户) 死亡动画下移 16px
            this.play('volatile_crystal_dead');
            this.once('animationcomplete-volatile_crystal_dead', () => {
                if (!this.scene || !this.active) return;
                this.scene.tweens.add({ targets: this, alpha: 0, delay: 350, duration: 300, onComplete: () => { if (this.scene && this.active) this.destroy(); } });
            });
            this.scene.time.delayedCall(2200, () => { if (this.scene && this.active) this.destroy(); });   // 兜底
        } else {
            this.destroy();
        }
    }

    /** state → anim mapping */
    _updateAnim() {
        if (this.hasExploded) return;
        let key;
        if (this._hitTimer > 0) {
            this._hitTimer -= this.scene.game.loop.delta;
            key = 'volatile_crystal_injuried';
        } else if (this.state === 'triggered') {
            key = 'volatile_crystal_charge';
        } else {
            key = 'volatile_crystal_idle';
        }
        if (key !== this._lastAnimKey) {
            this._lastAnimKey = key;
            if (this.scene.anims.exists(key)) this.play(key);
        }
    }
}