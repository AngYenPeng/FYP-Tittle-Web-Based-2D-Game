/**
 * BatNest — 蝙蝠巢穴 (BatBoss 战斗中召唤蝙蝠)
 *
 * 行为:
 *   - 玩家开始打 BatBoss 后 (调 startSummoning): 每 12~18 秒召唤 1 只蝙蝠
 *   - BatBoss 进入半血后 (调 setPhase2): 改为每 8~15 秒召唤 1 只
 *   - 召唤出的蝙蝠血量 50, 无重力, 直接进入仇恨追击
 *
 * 用法:
 *   const nest = new BatNest(scene, col, row);
 *   nest.startSummoning();     // boss 战开始
 *   nest.setPhase2();          // boss 半血时
 *   nest.stopSummoning();      // boss 死亡 / 战斗结束
 *
 * (需要场景里有 this.bats group 和 CrystalBat 类)
 */
class BatNest {
    constructor(scene, col, row, options = {}) {
        this.scene = scene;
        const G = 32;
        this.x = col * G + G / 2;
        this.y = row * G + G / 2 + (options.yOffset || 0);

        this.batHp = options.batHp != null ? options.batHp : null;   // 召唤蝙蝠血量 (null = 用 CrystalBat 原本血量, 不覆盖)
        this.phase1Range = options.phase1Range || [12000, 18000];    // 一阶段间隔 (ms)
        this.phase2Range = options.phase2Range || [8000, 15000];     // 半血后间隔 (ms)
        this.maxAlive = options.maxAlive != null ? options.maxAlive : null;  // 该巢同时存活上限 (null=不限)
        this.hp = options.hp != null ? options.hp : 60;   // 巢穴自身血量 (可被攻击破坏) — (用户) Easy 基准 80→60
        this.maxHp = this.hp;

        this._active = false;
        this._phase2 = false;
        this._timer = null;
        this._spawned = [];   // 该巢召唤过的 (用于可选存活上限统计)

        // 视觉 — 优先 BatNest 贴图, fallback 深褐巢穴矩形
        if (options.texture !== false && scene.textures.exists(options.texture || 'BatNest')) {
            this.sprite = scene.add.image(this.x, this.y, options.texture || 'BatNest')
                .setDepth(9);
            if (options.displaySize) this.sprite.setDisplaySize(options.displaySize[0], options.displaySize[1]);
        } else {
            this.sprite = scene.add.ellipse(this.x, this.y, 48, 34, 0x3a2a1a, 1)
                .setStrokeStyle(3, 0x1f140a).setDepth(9);
        }
        if (scene.uiCam) { try { scene.uiCam.ignore(this.sprite); } catch (e) {} }

        // 血条 (巢穴可被破坏 — 显示血量); 巢是静态的, 位置固定一次即可
        const HB_W = 44;
        const hbY = this.y - (this.sprite.displayHeight || 34) / 2 - 10;
        this._hpBg  = scene.add.rectangle(this.x - HB_W / 2, hbY, HB_W, 5, 0x000000, 0.6).setOrigin(0, 0.5).setDepth(58);
        this._hpBar = scene.add.rectangle(this.x - HB_W / 2, hbY, HB_W, 5, 0xcc3344, 1).setOrigin(0, 0.5).setDepth(58);
        this._hpBarW = HB_W;
        if (scene.uiCam) { try { scene.uiCam.ignore([this._hpBg, this._hpBar]); } catch (e) {} }
        // (用户) 剧情期间不显示血条 — 默认隐藏, startSummoning (开打) / 挨打时才显示
        this.setHpBarVisible(false);

        scene._batNests = scene._batNests || [];
        scene._batNests.push(this);
    }

    /** (用户) 血条显隐 (剧情期间隐藏, 开打/挨打显示) */
    setHpBarVisible(v) {
        if (this._hpBg)  this._hpBg.setVisible(v);
        if (this._hpBar) this._hpBar.setVisible(v);
    }

    startSummoning() {
        this.setHpBarVisible(true);   // (用户) 开打 → 显示血条
        if (this._dead || (this.hp != null && this.hp <= 0)) return;   // (用户) 已打烂的巢不再生蝙蝠
        if (this._active) return;
        this._active = true;
        this._scheduleNext();
    }

    stopSummoning() {
        this._active = false;
        if (this._timer) { try { this._timer.remove(); } catch (e) {} this._timer = null; }
    }

    // boss 半血后调用 → 切换到更快的召唤频率
    setPhase2(on) {
        this._phase2 = (on !== false);
    }

    _scheduleNext() {
        if (!this._active) return;
        const range = this._phase2 ? this.phase2Range : this.phase1Range;
        const delay = Phaser.Math.Between(range[0], range[1]);
        this._timer = this.scene.time.delayedCall(delay, () => {
            this._summon();
            this._scheduleNext();
        });
    }

    _aliveCount() {
        this._spawned = this._spawned.filter(b => b && b.active && b.hp > 0);
        return this._spawned.length;
    }

    _summon() {
        const s = this.scene;
        if (this._dead || !this._active || !s || !s.bats || typeof CrystalBat === 'undefined') return;
        if (this.maxAlive != null && this._aliveCount() >= this.maxAlive) return;
        // 全局上限 (区2 最多 _batZoneCap 只蝙蝠 — 场景设置; 跨所有巢统计)
        if (s._batZoneCap != null && s.bats.getChildren) {
            const aliveAll = s.bats.getChildren().filter(b => b && b.active && (b.hp === undefined || b.hp > 0)).length;
            if (aliveAll >= s._batZoneCap) return;
        }

        const bat = new CrystalBat(s, this.x, this.y + 10);
        if (this.batHp != null) bat.hp = this.batHp;   // 只在显式传 batHp 时覆盖, 否则用 CrystalBat 原本血量
        bat.forceAggroTimer = 1e12;          // 持续仇恨, 立即追击玩家
        bat._fromNest = true;
        s.bats.add(bat);
        if (bat.body) bat.body.setAllowGravity(false);  // 蝙蝠无重力 (必须在 add 之后, 否则被物理组默认 allowGravity:true 覆盖)
        if (s.uiCam) { try { s.uiCam.ignore(bat); } catch (e) {} }
        this._spawned.push(bat);

        // 召唤小特效 (一圈扩散光环)
        if (s.add) {
            const ring = s.add.circle(this.x, this.y, 8, 0x8866ff, 0).setStrokeStyle(2, 0xaa88ff).setDepth(58);
            if (s.uiCam) { try { s.uiCam.ignore(ring); } catch (e) {} }
            s.tweens.add({
                targets: ring, scaleX: 4.5, scaleY: 4.5, alpha: 0, duration: 380,
                onComplete: () => { try { ring.destroy(); } catch (e) {} }
            });
        }
        return bat;
    }

    destroy() {
        this._dead = true;   // 死亡标记 — 任何后续 startSummoning 都会跳过
        this.stopSummoning();
        if (this.sprite) { try { this.sprite.destroy(); } catch (e) {} this.sprite = null; }
        if (this._hpBg)  { try { this._hpBg.destroy(); }  catch (e) {} this._hpBg = null; }
        if (this._hpBar) { try { this._hpBar.destroy(); } catch (e) {} this._hpBar = null; }
        const arr = this.scene && this.scene._batNests;
        if (arr) { const i = arr.indexOf(this); if (i >= 0) arr.splice(i, 1); }
        const arr2 = this.scene && this.scene._sz4BatNests;
        if (arr2) { const j = arr2.indexOf(this); if (j >= 0) arr2.splice(j, 1); }
    }

    // 被攻击 (近战/丢稿子) — hp<=0 时破坏
    takeDamage(dmg) {
        this.setHpBarVisible(true);   // (用户) 挨打 → 显示血条
        if (this.hp == null || this.hp <= 0) return;
        this.hp -= (dmg || 0);
        if (this._hpBar) this._hpBar.scaleX = Math.max(0, this.hp / this.maxHp);
        if (this.sprite) {
            try { if (this.sprite.setTintFill) this.sprite.setTintFill(0xffffff); } catch (e) {}
            if (this.scene && this.scene.time) this.scene.time.delayedCall(90, () => { try { if (this.sprite && this.sprite.clearTint) this.sprite.clearTint(); } catch (e) {} });
        }
        if (this.hp <= 0) {
            this.hp = 0;
            if (this.scene && this.scene.add) {
                const cx = this.x, cy = this.y, sc = this.scene;
                // 白闪 (实心短促) — 跟召唤的空心紫环明显区分
                const flash = sc.add.circle(cx, cy, 18, 0xffffff, 0.85).setDepth(59);
                if (sc.uiCam) { try { sc.uiCam.ignore(flash); } catch (e) {} }
                sc.tweens.add({ targets: flash, scaleX: 1.7, scaleY: 1.7, alpha: 0, duration: 200, onComplete: () => { try { flash.destroy(); } catch (e) {} } });
                // 深色碎片四散 (召唤没有碎片 → 一眼看出是"打烂"不是"生蝙蝠")
                for (let i = 0; i < 8; i++) {
                    const ang = (Math.PI * 2 / 8) * i + Math.random() * 0.5;
                    const dist = 32 + Math.random() * 28;
                    const frag = sc.add.rectangle(cx, cy, 6, 6, 0x5a3d6b).setDepth(58);
                    if (sc.uiCam) { try { sc.uiCam.ignore(frag); } catch (e) {} }
                    sc.tweens.add({
                        targets: frag, x: cx + Math.cos(ang) * dist, y: cy + Math.sin(ang) * dist + 18,
                        alpha: 0, angle: Math.random() * 540, duration: 420 + Math.random() * 180,
                        onComplete: () => { try { frag.destroy(); } catch (e) {} }
                    });
                }
            }
            this.destroy();
        }
    }
}

if (typeof window !== 'undefined') window.BatNest = BatNest;