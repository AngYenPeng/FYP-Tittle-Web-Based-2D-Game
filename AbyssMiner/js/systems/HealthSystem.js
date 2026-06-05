/**
 * HealthSystem — 血量条 + 爱心生命数
 *
 * 阶段 3 改造:
 * - 血量 HP (0-100): 怪物/Boss 攻击扣 HP
 * - 爱心 hearts (0-5): HP 到 0 → -1 爱心 + 回满 HP; 爱心到 0 → 死亡返回大厅
 * - UI: 左上角 [血量条] + 右侧"x5"爱心数
 * - 后续 (阶段 4) 会接入腐蚀度条
 */
class HealthSystem {
    constructor(scene) {
        this.scene = scene;
        // === 新系统 ===
        this.maxHp = 100;
        this.hp = 100;
        const _dh = (window.AbyssDiff ? AbyssDiff.get().hearts : 5);   // (用户) 难度: easy5 / normal3 / hard,extreme1
        this.maxHearts = _dh;
        this.hearts = _dh;
        this.isDead = false;

        // === 旧 API 兼容 (保留属性, 别处可能引用) ===
        this.playerHp = this.hp;      // 旧别名
        this.halfHp = this.maxHp;     // 旧别名 (虽然语义不同)
        this.heartSprites = [];       // 旧迭代器, 保留空数组防止 setHUDVisible 报错
        this.shieldOverlays = [];     // 旧迭代器
        this.shieldCount = 0;         // 护盾药水已删, 永远 0

        // UI 元素
        this.hpBarBg = null;
        this.hpBarFill = null;
        this.hpBarBorder = null;
        this.hpText = null;
        this.heartsText = null;

        // 死亡面板
        this.deathPanel = null;
        this.deathText = null;
        this.deathCountdown = 0;
        this.returningToHub = false;
    }

    init() {
        const s = this.scene;

        // === HP 条 ===
        // 老爱心中心 (60,60), 现在 HP 条中心 y=60 保持垂直一致
        // 水晶仍在 y=120, guide 仍在 y=180, 间距 60 不变
        const barX = 24;          // 左边起点
        const barY = 60;          // 上下中心 (跟老爱心一致)
        const barW = 240;
        const barH = 28;

        this.hpBarBg = s.add.rectangle(barX, barY, barW, barH, 0x222222, 0.85)
            .setOrigin(0, 0.5).setDepth(200).setScrollFactor(0);
        this.hpBarFill = s.add.rectangle(barX + 2, barY, barW - 4, barH - 4, 0xdd2222, 1)
            .setOrigin(0, 0.5).setDepth(201).setScrollFactor(0);
        this.hpBarBorder = s.add.rectangle(barX, barY, barW, barH)
            .setOrigin(0, 0.5).setDepth(202).setScrollFactor(0)
            .setStrokeStyle(2, 0xffffff).setFillStyle();

        this.hpText = s.add.text(barX + barW / 2, barY, '100 / 100', {
            fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
            fontFamily: '"VT323", monospace', stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5).setDepth(203).setScrollFactor(0);

        // === 爱心数 (右侧 "x5") — (用户) 有 Heart 贴图: 图标 + xN; 缺图回退旧 ❤ 文本 ===
        if (s.textures.exists('Heart')) {
            this.heartIcon = s.add.image(barX + barW + 14, barY, 'Heart')
                .setDisplaySize(26, 26).setOrigin(0, 0.5).setDepth(203).setScrollFactor(0);
            this.heartsText = s.add.text(barX + barW + 14 + 30, barY, 'x' + this.hearts, {
                fontSize: '26px', color: '#ff5577', fontStyle: 'bold',
                fontFamily: '"VT323", monospace', stroke: '#000', strokeThickness: 4
            }).setOrigin(0, 0.5).setDepth(203).setScrollFactor(0);
        } else {
            this.heartsText = s.add.text(barX + barW + 12, barY, '❤x' + this.hearts, {
                fontSize: '26px', color: '#ff5577', fontStyle: 'bold',
                fontFamily: '"VT323", monospace', stroke: '#000', strokeThickness: 4
            }).setOrigin(0, 0.5).setDepth(203).setScrollFactor(0);
        }

        // === 死亡面板 ===
        const cx = s.cameras.main.width / 2;
        const cy = s.cameras.main.height / 2;
        this.deathPanel = s.add.container(cx, cy).setScrollFactor(0).setDepth(300).setVisible(false);
        const bg = s.add.rectangle(0, 0, 800, 150, 0x000000, 0.85);
        this.deathText = s.add.text(0, 0, 'YOU DIED', {
            fontSize: '52px', color: '#ff4444',
            fontFamily: '"VT323", monospace'
        }).setOrigin(0.5);
        this.deathPanel.add([bg, this.deathText]);

        this.updateUI();
    }

    /**
     * 受伤. 返回 true 表示"有效命中" (扣血成功), false 表示被无敌挡掉.
     * 怪物攻击后用返回值决定要不要附加 corrosion / DoT / slow 等副作用.
     *
     * @param {number} amount HP 伤害量
     * @param {object} opts
     *   - ignoreIframe: bool   绕过无敌检查 (DoT / 蜘蛛 cling / 满侵蚀度扣血 用)
     *   - triggerIframe: bool  这次扣血是否触发新的 0.5s 无敌 (默认 true)
     */
    takeDamage(amount = 10, opts = {}) {
        if (this.isDead) return false;
        if (this.scene._creativeInvincible) return false;

        const ignoreIframe   = opts.ignoreIframe === true;
        const triggerIframe  = opts.triggerIframe !== false;

        if (!ignoreIframe && this.scene.isPlayerInvincible) {
            return false;
        }

        this.hp = Math.max(0, this.hp - amount);
        this.playerHp = this.hp;
        if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this.scene, 'MinerHurt');  // 玩家受伤音效

        // 红闪 0.2 秒 (每次有效扣血都闪)
        this._flashRed(200);

        if (triggerIframe) {
            this._triggerInvincibility(500);
        }

        if (this.hp <= 0) {
            this._loseHeart();
        }
        this.updateUI();
        return true;
    }

    /** 别名 — SpiderQueenBoss 用 damage(15). 默认带 iframe, 走标准路径 */
    damage(amount) { return this.takeDamage(amount); }

    /** 0.2 秒红色闪烁 (每次有效扣血触发) — 与 iframe 透明效果共存 */
    _flashRed(ms) {
        const s = this.scene;
        if (!s.player || !s.player.setTint) return;
        s.player.setTint(0xff3333);
        if (this._flashTimer) {
            try { this._flashTimer.remove(); } catch(e) {}
        }
        this._flashTimer = s.time.delayedCall(ms, () => {
            if (s.player && s.player.clearTint && !this.isDead) {
                s.player.clearTint();
            }
        });
    }

    /** 触发 N ms 无敌. 多次调用会重置计时 (取最后一次) */
    _triggerInvincibility(ms) {
        const s = this.scene;
        s.isPlayerInvincible = true;
        if (s.player && s.player.setAlpha) s.player.setAlpha(0.4);
        if (this._iframeTimer) {
            try { this._iframeTimer.remove(); } catch(e) {}
        }
        this._iframeTimer = s.time.delayedCall(ms, () => {
            if (!this.isDead && !this.returningToHub) {
                s.isPlayerInvincible = false;
                if (s.player && s.player.setAlpha) s.player.setAlpha(1);
            }
        });
    }

    /** HP 归零 → 扣 1 爱心. 爱心剩余 → 5 秒倒计时 → 复活在最新存档点. 爱心归零 → 永久死亡返回大厅 */
    _loseHeart() {
        this.hearts--;
        if (this.hearts <= 0) {
            this.hearts = 0;
            this._permanentDeath();
            return;
        }
        // 还有爱心 → 5 秒倒计时 → 传送到最新存档点
        this._startRespawnCountdown();
    }

    /** 5 秒死亡倒计时 (HP=0 但还有爱心) */
    _startRespawnCountdown() {
        const s = this.scene;
        this.isDead = true;
        s.isDead = true;
        s.isPlayerStunned = true;
        s.isPlayerInvincible = true;
        if (s.diseaseSystem && s.diseaseSystem.resetOnDeath) s.diseaseSystem.resetOnDeath();   // (用户) 死亡清侵蚀/中毒 — 修复复活后无限扣血

        if (s.player) {
            s.player.setTint(0x555555);
            s.player.setAlpha(0.6);
            if (s.player.body) {
                s.player.body.setVelocity(0, 0);
                s.player.body.setAllowGravity(false);
                s.player.body.setImmovable(true);
            }
        }

        if (this.deathPanel) this.deathPanel.setVisible(false);   // 改用黑屏爱心动画, 不显示文字面板
        this.deathCountdown = 0;
        // 死亡黑屏爱心动画 (死前爱心数 = 当前+1, _loseHeart 已先扣) → 碎完即复活到存档点
        if (s._deathHeartAnim) {
            this._deathAnimPlaying = true;   // 动画期间挡住 update 倒计时
            s._deathHeartAnim(this.hearts + 1, () => { this._deathAnimPlaying = false; this._doRespawnAtCheckpoint(); });
            // 兜底: 动画链若被切后台打断 (tab 失焦), 最多 3.5s 强制复活+清覆盖层, 防侵蚀条/碎片 UI 卡死
            s.time.delayedCall(3500, () => {
                if (this._deathAnimPlaying) { this._deathAnimPlaying = false; this._doRespawnAtCheckpoint(); }
            });
        } else {
            this.deathPanel.setVisible(true);
            this.deathCountdown = 5000;
            this.deathText.setText('RESPAWNING IN 5...');
        }
    }

    /** 5 秒倒计时结束 → 复活在最新存档点 */
    _doRespawnAtCheckpoint() {
        const s = this.scene;
        // 优先用激活的 checkpoint, 否则用 spawn 点
        const spawnX = (s._activeCheckpoint && s._activeCheckpoint.x !== undefined) ? s._activeCheckpoint.x : s.spawnX;
        const spawnY = (s._activeCheckpoint && s._activeCheckpoint.y !== undefined) ? s._activeCheckpoint.y : s.spawnY;

        this.hp = this.maxHp;
        this.playerHp = this.hp;
        this.isDead = false;
        s.isDead = false;
        s.isPlayerStunned = false;

        // 清侵蚀度 (复活时清零)
        if (s.diseaseSystem && s.diseaseSystem.reset) s.diseaseSystem.reset();

        if (s.player) {
            s.player.clearTint();
            s.player.setAlpha(1);
            if (s.player.body) {
                s.player.body.setAllowGravity(true);
                s.player.body.setImmovable(false);
                s.player.body.reset(spawnX, spawnY);
            }
        }

        // pick 收回 + 钩状态清零
        if (s.pick1 && s.pick1.state !== 'idle' && s.pick1.backToInventory) s.pick1.backToInventory();
        if (s.pick2 && s.pick2.state !== 'idle' && s.pick2.backToInventory) s.pick2.backToInventory();
        s.inv = { left: true, right: true };
        s.isGrappling = false;
        s.activeGrapplePick = null;

        this.deathPanel.setVisible(false);
        if (s._deathClearOverlay) s._deathClearOverlay();   // 淡出死亡黑屏爱心覆盖层

        // 复活后短暂无敌 1 秒
        this._triggerInvincibility(1000);
        this.updateUI();
    }

    /** 爱心归零 → 死亡, 2 秒后返回 HubScene */
    _permanentDeath() {
        if (this.returningToHub) return;
        this.returningToHub = true;
        this.isDead = true;
        const s = this.scene;
        s.isDead = true;
        s.isPlayerStunned = true;
        if (s.diseaseSystem && s.diseaseSystem.resetOnDeath) s.diseaseSystem.resetOnDeath();   // (用户) 永久死亡同样清侵蚀/中毒

        if (s.player) {
            s.player.setTint(0x555555);
            s.player.setAlpha(0.5);
            if (s.player.body) {
                s.player.body.setVelocity(0, 0);
                s.player.body.setAllowGravity(false);
                s.player.body.setImmovable(true);
            }
        }

        if (this.deathPanel) this.deathPanel.setVisible(false);   // 改用黑屏爱心动画
        const goHub = () => { if (s.scene && s.scene.start) s.scene.start('HubScene'); };
        // 黑屏爱心动画 (最后 1 颗碎裂) → 回大厅
        if (s._deathHeartAnim) {
            s._deathHeartAnim(1, goHub);
        } else {
            this.deathPanel.setVisible(true);
            this.deathText.setText('YOU DIED — RETURNING TO HUB...');
            s.time.delayedCall(2500, goHub);
        }
    }

    /**
     * 治疗 — units 个单位, 每单位 +50% HP (治疗药水 1 瓶 = 1 unit = +50%)
     * 旧代码 heal(3) 会被这里加 150%, 等同回满
     */
    heal(units = 1) {
        const add = Math.round(this.maxHp * 0.5 * units);
        this.hp = Math.min(this.maxHp, this.hp + add);
        this.playerHp = this.hp;
        this.updateUI();
    }

    /** 增命药水 — +1 爱心 (不超过 maxHearts) */
    addHeart(n = 1) {
        this.hearts = Math.min(this.maxHearts, this.hearts + n);
        this.updateUI();
    }

    /** 旧 API: 护盾药水已删除, 保留空实现 */
    addShield() {}
    canShield() { return false; }
    currentFullHearts() { return this.hearts; }

    canHeal() {
        return this.hp < this.maxHp;
    }

    /** 治疗到满 HP (旧 API, 留兼容) */
    healToFull() {
        this.hp = this.maxHp;
        this.playerHp = this.hp;
        this.updateUI();
    }

    /** 治疗 N HP (Checkpoint 每秒回血用) */
    healAmount(n) {
        this.hp = Math.min(this.maxHp, this.hp + n);
        this.playerHp = this.hp;
        this.updateUI();
    }

    /** 存档恢复后调用, 重新刷新 UI */
    refresh() { this.updateUI(); }

    updateUI() {
        if (!this.hpBarFill) return;
        const barW = 240;
        const pct = Math.max(0, this.hp / this.maxHp);
        this.hpBarFill.width = (barW - 4) * pct;
        // 颜色按血量变化: 高=红, 中=黄, 低=橙
        if (pct > 0.6)      this.hpBarFill.fillColor = 0xdd2222;
        else if (pct > 0.3) this.hpBarFill.fillColor = 0xddaa22;
        else                this.hpBarFill.fillColor = 0xff6622;
        this.hpText.setText(Math.ceil(this.hp) + ' / ' + this.maxHp);
        this.heartsText.setText((this.heartIcon ? 'x' : '\u2764x') + this.hearts);   // (用户) 图标模式只显 xN
    }

    /** 每帧调用 — 处理 5 秒死亡倒计时 */
    update(delta) {
        // (用户) Shrine 回血 (guide caption 一直这么写但从未实现): 激活的 checkpoint 5 格 (160px) 内
        //   每秒 +1 HP / -1% 腐蚀; Extreme 难度关闭此效果
        const _cpd = (window.AbyssDiff ? AbyssDiff.get() : null);
        if ((!_cpd || _cpd.cpRegen) && !this.isDead) {
            const _s = this.scene, _cp = _s._activeCheckpoint;
            if (_cp && _s.player && _s.player.body) {
                const _dx = _s.player.x - _cp.x, _dy = _s.player.y - _cp.y;
                if (_dx * _dx + _dy * _dy <= 160 * 160) {
                    this._cpRegenAcc = (this._cpRegenAcc || 0) + delta;
                    if (this._cpRegenAcc >= 1000) {
                        this._cpRegenAcc -= 1000;
                        if (this.hp < this.maxHp) this.heal(1);
                        if (_s.diseaseSystem && _s.diseaseSystem.corrosionPct > 0) {
                            _s.diseaseSystem.corrosionPct = Math.max(0, _s.diseaseSystem.corrosionPct - 1);
                            if (_s.diseaseSystem._updateUI) _s.diseaseSystem._updateUI();
                        }
                    }
                } else this._cpRegenAcc = 0;
            }
        }
        if (!this.isDead) return;
        if (this.returningToHub) return;  // 永久死亡走的是 delayedCall
        if (this._deathAnimPlaying) return;  // 黑屏爱心动画期间不走倒计时 (动画完自己复活)
        this.deathCountdown -= delta;
        const sec = Math.max(1, Math.ceil(this.deathCountdown / 1000));
        this.deathText.setText('RESPAWNING IN ' + sec + '...');
        if (this.deathCountdown <= 0) this._doRespawnAtCheckpoint();
    }

    /** 旧 API: 不再有自动复活 (会扣 1 心然后回满 HP). 保留以防外部调用 */
    respawn() {
        // 旧调用入口 - 现在等同于 "重置到血满 + 爱心满 + 清侵蚀度"
        this.hp = this.maxHp;
        this.hearts = this.maxHearts;
        this.playerHp = this.hp;
        this.isDead = false;
        const s = this.scene;
        s.isDead = false;
        s.isPlayerStunned = false;
        // 玩家复活 → 侵蚀度完全清零
        if (s.diseaseSystem && s.diseaseSystem.reset) s.diseaseSystem.reset();
        if (s.player) {
            s.player.clearTint();
            s.player.setAlpha(1);
        }
        if (this.deathPanel) this.deathPanel.setVisible(false);
        this.updateUI();
    }
}