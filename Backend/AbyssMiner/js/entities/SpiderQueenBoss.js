/**
 * SpiderQueenBoss — SafeZone4 final boss
 * HP 200
 * 模式 (循环):
 *  - phase 1 (HP > 100): bungee drop + 召唤小蜘蛛
 *  - phase 2 (HP <= 100): 加快 + 喷射水晶弹
 */
class SpiderQueenBoss extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        super(scene, x, y, 'Miner_stand', 0);
        scene.add.existing(this);
        scene.physics.add.existing(this);
        this.setTint(0x6633aa);
        this.setDisplaySize(120, 120);
        this.body.setSize(96, 96);
        this.body.setAllowGravity(false);
        this.setDepth(15);

        this.hp = 200;
        this.maxHp = 200;
        this.state = 'idle';
        this.cd = 0;
        this.phase = 1;
        this._homeX = x;
        this._homeY = y;
        this.attackCount = 0;
        this.isBoss = true;

        const W = 120;
        this._hpBg = scene.add.rectangle(x, y - 70, W, 8, 0x111111).setDepth(20);
        this._hpBar = scene.add.rectangle(x - W/2, y - 70, W, 8, 0x9933cc).setOrigin(0, 0.5).setDepth(21);
        if (scene.uiCam) {
            try { scene.uiCam.ignore(this._hpBg); } catch(e) {}
            try { scene.uiCam.ignore(this._hpBar); } catch(e) {}
        }
    }

    update(time, delta, player) {
        if (this.hp <= 0) return;
        if (this.cd > 0) this.cd -= delta;

        this._hpBg.setPosition(this.x, this.y - 70);
        this._hpBar.setPosition(this.x - 60, this.y - 70);
        this._hpBar.scaleX = Math.max(0, this.hp / this.maxHp);

        if (this.hp <= this.maxHp / 2 && this.phase === 1) {
            this.phase = 2;
            this.setTint(0xcc3366);
        }

        if (this.state === 'idle') {
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            if (dx*dx + dy*dy < 800 * 800) {
                this.state = 'attacking';
                this.cd = 1500;
            }
            return;
        }

        if (this.state === 'attacking') {
            // 缓慢移动接近玩家
            const dx = player.x - this.x;
            const speed = this.phase === 2 ? 60 : 40;
            this.x += (dx > 0 ? 1 : -1) * speed * delta / 1000;

            if (this._disableAttack) return;  // 禁用攻击

            if (this.cd <= 0) {
                this._spawnAttack(player);
                this.attackCount++;
                this.cd = this.phase === 2 ? 1200 : 2000;
            }
            return;
        }
    }

    _spawnAttack(player) {
        // 喷射 3 颗水晶弹朝玩家
        const numBullets = this.phase === 2 ? 5 : 3;
        const angBase = Math.atan2(player.y - this.y, player.x - this.x);
        for (let i = 0; i < numBullets; i++) {
            const offset = (i - (numBullets - 1) / 2) * 0.3;
            const ang = angBase + offset;
            const bullet = this.scene.add.circle(this.x, this.y, 8, 0x66aaff);
            bullet.setStrokeStyle(2, 0x4488dd);
            bullet.setDepth(16);
            this.scene.physics.add.existing(bullet);
            bullet.body.setAllowGravity(false);
            const sp = this.phase === 2 ? 300 : 220;
            bullet.body.setVelocity(Math.cos(ang) * sp, Math.sin(ang) * sp);
            if (this.scene.uiCam) try { this.scene.uiCam.ignore(bullet); } catch(e) {}
            // 2 秒后消失 / 撞玩家
            const evt = this.scene.time.addEvent({
                delay: 30,
                repeat: 70,
                callback: () => {
                    if (!bullet.active) return;
                    const p = this.scene.player;
                    if (p && Math.abs(p.x - bullet.x) < 24 && Math.abs(p.y - bullet.y) < 24) {
                        if (this.scene.healthSystem) this.scene.healthSystem.damage(15);
                        bullet.destroy();
                        evt.remove();
                    }
                }
            });
            this.scene.time.delayedCall(2200, () => { if (bullet.scene) bullet.destroy(); });
        }
    }

    takeDamage(dmg) {
        this.hp -= dmg;
        this.setTint(0xff66ff);
        this.scene.time.delayedCall(120, () => {
            if (this.hp > 0) this.setTint(this.phase === 2 ? 0xcc3366 : 0x6633aa);
        });
        if (this.hp <= 0) this.die();
    }

    die() {
        this.hp = 0;
        this.state = 'dead';
        this.setTint(0x222222);
        if (this._hpBg) this._hpBg.destroy();
        if (this._hpBar) this._hpBar.destroy();
        this.scene.events.emit('spider_queen_died', { x: this.x, y: this.y });
        if (window.AbyssDiff && AbyssDiff.markCleared) AbyssDiff.markCleared();   // (用户) 最终 boss 死 = 通关 → 解锁 Extreme
        // (用户成就) 绝缝求生 (本区未死) + 珍惜生命 (全程零死亡)
        try {
            if (typeof AchievementSystem !== 'undefined') {
                const rd = (this.scene.registry && this.scene.registry.get('runDeaths')) || 0;
                if (rd === 0) AchievementSystem.unlock(this.scene, 'one_life');
            }
        } catch (e) {}
        this.scene.tweens.add({
            targets: this,
            angle: 180,
            alpha: 0.4,
            duration: 1500,
            ease: 'Cubic.easeIn'
        });
    }
}