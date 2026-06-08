/**
 * DiseaseSystem — 侵蚀度 + 减速 + DoT
 *
 * 模型 (战斗系统大改后):
 * - corrosionPct (0-100): 侵蚀度百分比, 显示在腐蚀度条上 (满 100%)
 * - slowFromCorrosion = corrosionPct / 2 (0-50%): 2% 侵蚀度 = 1% 减速
 * - tempSlowPct (0-100): 临时减速 (例如蚯蚓 15% × 1.5s), 不叠加
 * - totalSlow = clamp(slowFromCorrosion + tempSlowPct, 0, 75): 总减速 (上限 75%)
 *
 * 怪物攻击副作用通过这些 API 调:
 * - addCorrosion(pct)             — 瞬间 +N% 侵蚀度
 * - addCorrosionDoT(ps, dur)      — N% / 秒 × T 秒 累积 (爆炸花/史莱姆 等)
 * - addTempSlow(pct, dur)         — 临时减速 N% × T 秒 (蚯蚓; 不叠加)
 * - addHpDoT(amt, ps, dur)        — N HP/秒 × T 秒 (蜘蛛毒; 不触发无敌帧)
 *
 * 后台流程:
 * - 自然累积 (持有水晶): 每 max(5, 60-水晶数) 秒 +1% 侵蚀度 (旧规则保留)
 * - 100% 侵蚀度 → 每秒 1 HP 持续伤害 (绕过无敌帧)
 * - 阈值对话: 减速 10/25/50% 触发 (各一次, cure 后重置)
 * - 健康药水 cure() → 清零侵蚀度 + tempSlow + 取消所有 DoT
 */
class DiseaseSystem {
    constructor(scene) {
        this.scene = scene;
        this.corrosionPct = 0;
        this.maxCorrosion = 100;
        this.tempSlowPct  = 0;
        this.tempSlowUntil = 0;     // 截止时间戳

        this.nextNaturalTickAt = 0;  // 自然累积下一次 +1%
        this.damageTickAt      = 0;  // 满侵蚀度时每秒扣 1 HP 的时间戳
        this.shownDialog10 = false;
        this.shownDialog25 = false;
        this.shownDialog50 = false;

        // 活动 DoT (HP 持续伤害 + 侵蚀度持续累积)
        this._activeDots = [];

        // UI
        this.corrosionBg = null;
        this.corrosionFill = null;
        this.corrosionBorder = null;
        this.corrosionLine20 = null;
        this.corrosionLine50 = null;
        this.corrosionText = null;
        this._barVisible = false;
    }

    init() {
        const s = this.scene;
        // (用户) 每次进场景重置"趴身蜘蛛"计数 — 否则被蜘蛛趴身时 Settings 退出再读档, 计数残留在复用实例上 → 蜘蛛没了却永久每秒扣血
        s._clingingSpiderCount = 0;
        this.clingDamageTickAt = 0;
        const barX = 24;
        const barY = 120;
        const barW = 240;
        const barH = 22;

        // (用户) 图片腐蚀条: Corrosion 框 + Corrosion_Fill 填充 (×2, 中心对齐, 框压填充); 标线按填充实宽 200px 重算; 缺图回退旧矩形
        this._imgCorBar = s.textures.exists('Corrosion') && s.textures.exists('Corrosion_Fill');
        if (this._imgCorBar) {
            const cxBar = barX + 108;
            this.corrosionBg = null;
            this.corrosionFill = s.add.image(cxBar, barY, 'Corrosion_Fill').setScale(2).setDepth(201).setScrollFactor(0);
            this.corrosionBorder = s.add.image(cxBar, barY, 'Corrosion').setScale(2).setDepth(202).setScrollFactor(0);
            const fillLeft = cxBar - 100;
            this.corrosionLine20 = s.add.rectangle(fillLeft + 200 * 0.20, barY, 2, 10, 0xffff00, 1)
                .setOrigin(0.5, 0.5).setDepth(203).setScrollFactor(0);
            this.corrosionLine50 = s.add.rectangle(fillLeft + 200 * 0.50, barY, 2, 10, 0xff6622, 1)
                .setOrigin(0.5, 0.5).setDepth(203).setScrollFactor(0);
        } else {
            this.corrosionBg = s.add.rectangle(barX, barY, barW, barH, 0x222222, 0.85)
                .setOrigin(0, 0.5).setDepth(200).setScrollFactor(0);
            this.corrosionFill = s.add.rectangle(barX + 2, barY, 0, barH - 4, 0x884466, 1)
                .setOrigin(0, 0.5).setDepth(201).setScrollFactor(0);
            this.corrosionBorder = s.add.rectangle(barX, barY, barW, barH)
                .setOrigin(0, 0.5).setDepth(202).setScrollFactor(0)
                .setStrokeStyle(2, 0xaa6688).setFillStyle();
            // 标线 20% 侵蚀度 = 10% 减速
            const line20X = barX + (barW - 4) * 0.20 + 2;
            this.corrosionLine20 = s.add.rectangle(line20X, barY, 2, barH - 4, 0xffff00, 1)
                .setOrigin(0.5, 0.5).setDepth(203).setScrollFactor(0);
            // 标线 50% 侵蚀度 = 25% 减速
            const line50X = barX + (barW - 4) * 0.50 + 2;
            this.corrosionLine50 = s.add.rectangle(line50X, barY, 2, barH - 4, 0xff6622, 1)
                .setOrigin(0.5, 0.5).setDepth(203).setScrollFactor(0);
        }
        this.corrosionText = s.add.text(barX + barW / 2, barY, '0%', {
            fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
            fontFamily: '"VT323", monospace', stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5).setDepth(204).setScrollFactor(0).setVisible(false);   // (用户) 不显示 % 数字

        this.setBarVisible(false);

        if (s._hasHealthDetector) {
            this.setBarVisible(true);
            if (s.hudSystem && s.hudSystem._updateHealthDetectorLayout) {
                s.hudSystem._updateHealthDetectorLayout(true);
            }
        }
    }

    setBarVisible(visible) {
        this._barVisible = visible;
        [this.corrosionBg, this.corrosionFill, this.corrosionBorder,
         this.corrosionLine20, this.corrosionLine50].forEach(o => {
            if (o) o.setVisible(visible);
        });
        // (用户) 腐蚀度不再显示 % 数字 — corrosionText 永久隐藏, 已从可见性数组除名
    }

    /**
     * 健康药水 — 减 50% 侵蚀度 (不是清零) + 重置对话 flag.
     * 30s 免疫由 scene._diseaseImmuneUntil 控制 (BackpackSystem 用药时设).
     */
    cure() {
        this.corrosionPct = Math.max(0, this.corrosionPct - 50);
        this.tempSlowPct = 0;
        this.tempSlowUntil = 0;
        this._activeDots = [];  // 健康药水清掉持续 DoT
        // 重置对话 flag — 如果之后再升高, 可以再次提示
        this.shownDialog10 = (this.getSlowPct() >= 10);
        this.shownDialog25 = (this.getSlowPct() >= 25);
        this.shownDialog50 = (this.getSlowPct() >= 50);
        this.damageTickAt = 0;
        this._updateUI();
    }

    /** 完全重置 — 复活/死亡用. 比 cure 更彻底 */
    reset() {
        this.corrosionPct = 0;
        this.tempSlowPct = 0;
        this.tempSlowUntil = 0;
        this._activeDots = [];
        this.shownDialog10 = false;
        this.shownDialog25 = false;
        this.shownDialog50 = false;
        this.nextNaturalTickAt = 0;
        this.damageTickAt = 0;
        this._updateUI();
    }

    /** 减 N% 侵蚀度 (Checkpoint 每秒减用) */
    reduceCorrosion(pct) {
        this.corrosionPct = Math.max(0, this.corrosionPct - pct);
        this._updateUI();
    }

    // === Damage / debuff API (供怪物攻击调) ===

    /** 瞬间 +N% 侵蚀度 (clamp 0-100) */
    addCorrosion(pct) {
        this.corrosionPct = Math.min(this.maxCorrosion, this.corrosionPct + pct);
        this._updateUI();
    }

    /** 侵蚀度 DoT — 每秒 +ps%, 持续 dur 秒 */
    addCorrosionDoT(percentPerSecond, durationSeconds) {
        const now = this.scene.time.now;
        this._activeDots.push({
            kind: 'corrosion',
            ratePerSec: percentPerSecond,
            endsAt: now + durationSeconds * 1000,
            nextTickAt: now + 1000
        });
    }

    /** HP DoT — 每秒 -ps HP, 持续 dur 秒. 不触发无敌帧 (用于蜘蛛毒). */
    addHpDoT(perTickDamage, durationSeconds) {
        const now = this.scene.time.now;
        this._activeDots.push({
            kind: 'hp',
            damage: perTickDamage,
            endsAt: now + durationSeconds * 1000,
            nextTickAt: now + 1000
        });
    }

    /** (用户) 死亡全清 — 侵蚀度/所有 DoT/减速/计时器归零.
     *  修复: 侵蚀 100% 死亡后带进下一条命 → "满侵蚀每秒 1 HP (绕无敌帧)" 复活继续跑 = 无限扣血. */
    resetOnDeath() {
        const s = this.scene;
        this.corrosionPct = 0;
        this._activeDots = [];
        this.tempSlowPct = 0;
        this.tempSlowUntil = 0;
        this.nextNaturalTickAt = 0;
        this.damageTickAt = 0;
        this.clingDamageTickAt = 0;
        this.shownDialog10 = this.shownDialog25 = this.shownDialog50 = false;
        // (用户) 蜘蛛趴身计数强制归零 + 卡在 cling 的蜘蛛全部重置.
        //   根因: 计数只能由蜘蛛自己的 update 减, 而死亡传送后蜘蛛离屏被 AI 距离门控冻结,
        //   松手代码永远不跑 → 计数永久卡住 = "每秒 clingCount HP (绕无敌帧)" + 减速 debuff 永久.
        let detached = 0;
        ['spiders', 'bungeeSpiders', 'hunterSpiders', 'crystalSpiders'].forEach(k => {
            const g = s[k];
            if (g && g.children && g.children.iterate) {
                g.children.iterate(m => {
                    if (m && m.state && String(m.state).indexOf('cling') === 0) {
                        m.state = 'chase';
                        if (m.body && m.body.setAllowGravity) m.body.setAllowGravity(true);
                        if (m.setFlipY) m.setFlipY(false);
                        if (m.clearTint) m.clearTint();
                        m.isClimbing = false;
                        m._isCounted = false;
                        detached++;
                    }
                });
            }
        });
        const hadCount = s._clingingSpiderCount || 0;
        s._clingingSpiderCount = 0;
        this._updateUI();
        // console.log('[死亡清理] DoT/侵蚀/减速已清, 蜘蛛松手×' + detached + ' (趴身计数 ' + hadCount + '→0)');   // (用户) 验证完毕, 静默
    }

    /** 临时减速 — N% × T 秒, 不叠加 (取最长持续时间 + 最大值) */
    addTempSlow(pct, durationSeconds) {
        const now = this.scene.time.now;
        const newUntil = now + durationSeconds * 1000;
        // 不叠加: 如果当前已有 tempSlow, 只取更长持续 + 更大百分比
        this.tempSlowPct  = Math.max(this.tempSlowPct, pct);
        this.tempSlowUntil = Math.max(this.tempSlowUntil, newUntil);
    }

    /** 总减速 % (0-75) — Player 移动用 */
    getSlowPct() {
        const fromCorrosion = this.corrosionPct / 2;  // 1% 侵蚀度 = 0.5% 减速
        const total = fromCorrosion + this.tempSlowPct;
        return Math.min(75, total);
    }

    /** 速度乘数 (0.25-1) */
    getSpeedMultiplier() {
        return 1 - this.getSlowPct() / 100;
    }

    update(delta) {
        if (this.scene && this.scene._endingActive) return;   // (用户) 结局总闸
        const s = this.scene;
        const now = s.time.now;

        // 临时减速过期
        if (this.tempSlowPct > 0 && now >= this.tempSlowUntil) {
            this.tempSlowPct = 0;
            this.tempSlowUntil = 0;
        }

        // 处理 DoT
        if (this._activeDots.length > 0) {
            // (用户修复) 快照数组引用: tick 伤害可能致死 → resetOnDeath 把 _activeDots 换成新数组,
            // 旧循环按旧长度继续读新空数组 → undefined.endsAt 宕机
            const dots = this._activeDots;
            for (let i = dots.length - 1; i >= 0; i--) {
                const dot = dots[i];
                if (!dot) continue;
                if (now >= dot.endsAt) {
                    dots.splice(i, 1);
                    continue;
                }
                if (now >= dot.nextTickAt) {
                    dot.nextTickAt += 1000;
                    if (dot.kind === 'corrosion') {
                        this.addCorrosion(dot.ratePerSec);
                    } else if (dot.kind === 'hp') {
                        if (s.healthSystem && s.healthSystem.takeDamage) {
                            s.healthSystem.takeDamage(dot.damage, { ignoreIframe: true, triggerIframe: false });
                            if (this._activeDots !== dots) return;   // 致死已重置 → 本帧立即收手
                        }
                    }
                }
            }
        }

        // 自然累积 (持有水晶 + 不在免疫中)
        const immuneUntil = s._diseaseImmuneUntil || 0;
        const isImmune = now < immuneUntil;
        const crystalCount = s.hudSystem ? s.hudSystem.crystalCount : 0;
        if (crystalCount > 0 && !isImmune) {
            const interval = Math.max(5, 60 - crystalCount) * 1000;
            if (this.nextNaturalTickAt === 0) {
                this.nextNaturalTickAt = now + interval;
            }
            if (now >= this.nextNaturalTickAt && this.corrosionPct < this.maxCorrosion) {
                this.addCorrosion(window.AbyssDiff ? AbyssDiff.get().corrTick : 1);  // (用户) 难度: +1/2/3/4% per interval
                this.nextNaturalTickAt = now + interval;
            }
        } else {
            this.nextNaturalTickAt = 0;
        }

        // 阈值对话 (基于减速%)
        const slow = this.getSlowPct();
        if (slow >= 10 && !this.shownDialog10) {
            this.shownDialog10 = true;
            this._showFloatingMessage("Feeling a bit off... hope it's nothing serious...");
        }
        if (slow >= 25 && !this.shownDialog25) {
            this.shownDialog25 = true;
            this._showFloatingMessage("I think I'm getting sick... what should I do...");
        }
        if (slow >= 50 && !this.shownDialog50) {
            this.shownDialog50 = true;
            this._showFloatingMessage("I feel like I'm dying...");
        }

        // 满侵蚀度 (100%) → 每秒 1 HP 伤害 (绕过无敌帧)
        if (this.corrosionPct >= this.maxCorrosion) {
            if (this.damageTickAt === 0) this.damageTickAt = now + 1000;
            if (now >= this.damageTickAt) {
                if (s.healthSystem && s.healthSystem.takeDamage) {
                    s.healthSystem.takeDamage(Math.floor(1 * (window.AbyssDiff ? AbyssDiff.get().dmgMul : 1)), { ignoreIframe: true, triggerIframe: false, noCorrosion: true });   // (用户) 腐蚀满伤害 × 难度; noCorrosion 防自喂
                }
                this.damageTickAt = now + 1000;
            }
        } else {
            this.damageTickAt = 0;
        }

        // 蜘蛛 cling — 每只爬身上的蜘蛛 每秒 1 HP, 叠加, 不触发 iframe
        const clingCount = s._clingingSpiderCount || 0;
        if (clingCount > 0) {
            if (!this.clingDamageTickAt) this.clingDamageTickAt = now + 1000;
            if (now >= this.clingDamageTickAt) {
                if (s.healthSystem && s.healthSystem.takeDamage) {
                    s.healthSystem.takeDamage(Math.floor(clingCount * (window.AbyssDiff ? AbyssDiff.get().dmgMul : 1)), { ignoreIframe: true, triggerIframe: false });   // (用户) 向下取整
                }
                this.clingDamageTickAt = now + 1000;
            }
        } else {
            this.clingDamageTickAt = 0;
        }

        // 买了健康侦测仪 → 显示腐蚀度条
        if (s._hasHealthDetector && !this._barVisible) {
            this.setBarVisible(true);
            if (s.hudSystem && s.hudSystem._updateHealthDetectorLayout) {
                s.hudSystem._updateHealthDetectorLayout(true);
            }
        }
    }

    _updateUI() {
        // (用户成就) 我是如何走到这一步的 (腐蚀侧触发)
        try {
            const hs = this.scene.healthSystem;
            if (typeof AchievementSystem !== 'undefined' && hs && hs.hp === 1 && this.corrosionPct >= 100) AchievementSystem.unlock(this.scene, 'rock_bottom');
        } catch (e) {}
        if (!this.corrosionFill) return;
        const pct = this.corrosionPct / this.maxCorrosion;
        if (this._imgCorBar) {
            // (用户) 图片填充按腐蚀度从右往左裁: 纹理 100px = 100%
            this.corrosionFill.setCrop(0, 0, Math.round(100 * pct), 5);
        } else {
            const barW = 240;
            this.corrosionFill.width = (barW - 4) * pct;
            if (pct < 0.2)      this.corrosionFill.fillColor = 0x884466;
            else if (pct < 0.5) this.corrosionFill.fillColor = 0xcc4477;
            else                this.corrosionFill.fillColor = 0xff3366;
        }
        this.corrosionText.setText(Math.round(this.corrosionPct) + '%');
    }

    _showFloatingMessage(text) {
        const s = this.scene;
        const W = s.cameras.main.width;
        const H = s.cameras.main.height;
        const msg = s.add.text(W / 2, H - 180, text, {
            fontSize: '22px', color: '#ffaaaa', fontStyle: 'italic',
            fontFamily: '"VT323", monospace', stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5).setScrollFactor(0).setDepth(250);
        if (s.cameras.main) {
            try { s.cameras.main.ignore(msg); } catch(e) {}
        }
        s.tweens.add({
            targets: msg,
            alpha: { from: 1, to: 0 },
            y: H - 220,
            duration: 3500,
            ease: 'Quad.easeIn',
            onComplete: () => msg.destroy()
        });
    }
}