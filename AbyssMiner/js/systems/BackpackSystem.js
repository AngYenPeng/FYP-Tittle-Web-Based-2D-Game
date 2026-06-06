/**
 * BackpackSystem — 替代旧 InventorySystem
 *
 * 结构：
 *  - 24 格背包（4行×6列）按 B 键或右上角按钮开关
 *  - 3 格快捷槽（Z / X / C），始终显示在右下角
 *    Z=治疗药水(默认), X=盾牌药水(默认), C=空
 *  - 铁镐左右手系统保持不变（F 切换，保留 getActiveItem() 兼容）
 *  - addItem() / canAdd() / consumeActiveItem() 等旧 API 完全保留
 */
class BackpackSystem {
    constructor(scene) {
        this.scene = scene;

        // ── 背包物品数据 ──────────────────────────────────────
        this.SLOT_COUNT = 24;
        this.slots = new Array(this.SLOT_COUNT).fill(null);

        // ── 快捷槽数据（Z / X / C）───────────────────────────
        // 阶段 6 改造: 3 个槽位类型锁定 (Z=钥匙, X=健康药水, C=治疗药水)
        // count 在 refreshQuick 时从 InventorySystem 同步 (单一数据源)
        // 玩家在背包里不能拖拽改类型
        this.quickSlots = [
            { type: 'key',            count: 0, cooldown: 0, cooldownMax: 0, locked: true },
            { type: 'health_potion',  count: 0, cooldown: 0, cooldownMax: 0, locked: true },
            { type: 'healing_potion', count: 0, cooldown: 0, cooldownMax: 0, locked: true }
        ];
        this.quickCooldowns    = [0, 0, 0];
        this.quickCooldownMaxs = [0, 0, 0];
        this.QUICK_KEYS = ['Z', 'X', 'C'];

        // ── 铁镐左右手（兼容旧逻辑）───────────────────────────
        this.activeHand    = 'left';
        this.leftHandSlot  = 0;   // dummy，供旧代码访问
        this.rightHandSlot = 1;
        this._leftPick  = { type: 'pickaxe', side: 'left',  count: 1, cooldown: 0, cooldownMax: 0 };
        this._rightPick = { type: 'pickaxe', side: 'right', count: 1, cooldown: 0, cooldownMax: 0 };

        // ── UI 引用 ──────────────────────────────────────────
        this.isOpen = false;
        this.panel  = null;
        this._slotBgs       = [];
        this._slotIcons     = [];
        this._slotCountTxts = [];
        this._qBgs    = [];
        this._qIcons  = [];
        this._qCounts = [];
        this._qCdBars = [];
        this._qHighlights = [];    // 选中框
        this._selectedQuick = -1; // 正在「准备指定」的快捷槽（背包打开时有效）

        // 标记当前通过哪个快捷槽触发了 CD（供 startCooldown 用）
        this._activeQuickIdx = -1;
    }

    // ═══════════════════════════════════════════════════
    //  初始化 UI
    // ═══════════════════════════════════════════════════
    init() {
        this._buildQuickSlotUI();
        this._buildBackpackPanel();
        this._registerKeys();
        // 阶段 6: quickSlots 在 constructor 里已类型锁定, 这里不再重置
        this.refreshQuick();
    }

    // ── 快捷槽 UI ────────────────────────────────────────
    _buildQuickSlotUI() {
        const s = this.scene;
        const W = s.cameras.main.width;
        const H = s.cameras.main.height;
        const SZ = 58, GAP = 6;

        for (let i = 0; i < 3; i++) {
            const x = W - 20 - SZ / 2;
            const y = H - 20 - SZ / 2 - i * (SZ + GAP);

            const bg = s.add.rectangle(x, y, SZ, SZ, 0x111111, 0.88)
                .setStrokeStyle(2, 0x666666)
                .setScrollFactor(0).setDepth(900);
            this._qBgs.push(bg);

            // 高亮选中框
            const hl = s.add.rectangle(x, y, SZ + 4, SZ + 4, 0xffffff, 0)
                .setStrokeStyle(3, 0xffff00)
                .setScrollFactor(0).setDepth(901).setVisible(false);
            this._qHighlights.push(hl);

            const icon = s.add.image(x, y, '__WHITE')
                .setDisplaySize(36, 36)
                .setScrollFactor(0).setDepth(901).setVisible(false);
            this._qIcons.push(icon);

            const keyLbl = s.add.text(x - SZ / 2 + 4, y - SZ / 2 + 2, this.QUICK_KEYS[i], {
                fontSize: '17px', color: '#aaaaaa', fontFamily: '"VT323", monospace'
            }).setScrollFactor(0).setDepth(902);

            const cntTxt = s.add.text(x + SZ / 2 - 3, y + SZ / 2 - 2, '', {
                fontSize: '18px', color: '#ffffff', fontFamily: '"VT323", monospace'
            }).setOrigin(1, 1).setScrollFactor(0).setDepth(902).setVisible(false);
            this._qCounts.push(cntTxt);

            const cdBar = s.add.rectangle(x, y + SZ / 2, SZ, 0, 0x000000, 0.65)
                .setOrigin(0.5, 1).setScrollFactor(0).setDepth(903).setVisible(false);
            this._qCdBars.push(cdBar);

            // 点击快捷槽 → 在背包模式下选择目标快捷槽
            bg.setInteractive(new Phaser.Geom.Rectangle(-SZ/2, -SZ/2, SZ, SZ), Phaser.Geom.Rectangle.Contains);
            bg.on('pointerdown', () => {
                if (this.isOpen) {
                    this._selectedQuick = (this._selectedQuick === i) ? -1 : i;
                    this._refreshHighlights();
                }
            });

            // 让 uiCam 忽略（防止 scrollFactor 0 遮挡）
            this._qAllObjects = this._qAllObjects || [];
            this._qAllObjects.push(bg, hl, icon, keyLbl, cntTxt, cdBar);
        }
    }

    // ── 背包面板 ─────────────────────────────────────────
    _buildBackpackPanel() {
        const s = this.scene;
        const W = s.cameras.main.width;
        const H = s.cameras.main.height;

        const COLS = 6, ROWS = 4;
        const SZ = 54, GAP = 8;
        const pw = COLS * SZ + (COLS - 1) * GAP + 48;
        const ph = ROWS * SZ + (ROWS - 1) * GAP + 110;

        this.panel = s.add.container(W / 2, H / 2)
            .setScrollFactor(0).setDepth(950).setVisible(false);

        const bg = s.add.rectangle(0, 0, pw, ph, 0x080808, 0.96)
            .setStrokeStyle(2, 0x555555);

        const title = s.add.text(0, -ph / 2 + 24, 'BACKPACK', {
            fontSize: '32px', color: '#ffffff', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 5
        }).setOrigin(0.5);

        const hint = s.add.text(0, -ph / 2 + 56, 'Select Z / X / C then click item to assign', {
            fontSize: '18px', color: '#ffcc66', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5);

        const closeBtn = s.add.text(pw / 2 - 16, -ph / 2 + 16, '✕', {
            fontSize: '24px', color: '#ff5555', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5).setInteractive();
        closeBtn.on('pointerdown', () => this.close());
        closeBtn.on('pointerover', () => closeBtn.setColor('#ff0000'));
        closeBtn.on('pointerout',  () => closeBtn.setColor('#ff5555'));

        this.panel.add([bg, title, hint, closeBtn]);

        // 格子
        const gsx = -(COLS * SZ + (COLS - 1) * GAP) / 2 + SZ / 2;
        const gsy = -ph / 2 + 72 + SZ / 2;

        for (let idx = 0; idx < COLS * ROWS; idx++) {
            const col = idx % COLS, row = Math.floor(idx / COLS);
            const x = gsx + col * (SZ + GAP);
            const y = gsy + row * (SZ + GAP);

            const sb = s.add.rectangle(x, y, SZ, SZ, 0x1e1e1e, 0.9)
                .setStrokeStyle(1, 0x444444).setInteractive();
            sb.on('pointerover', () => sb.setFillStyle(0x2e2e2e, 1));
            sb.on('pointerout',  () => sb.setFillStyle(0x1e1e1e, 0.9));
            sb.on('pointerdown', () => this._onSlotClick(idx));

            const si = s.add.image(x, y, '__WHITE').setDisplaySize(36, 36).setVisible(false);
            const sc = s.add.text(x + SZ / 2 - 3, y + SZ / 2 - 2, '', {
                fontSize: '16px', color: '#ffffff', fontFamily: '"VT323", monospace'
            }).setOrigin(1, 1).setVisible(false);

            this.panel.add([sb, si, sc]);
            this._slotBgs.push(sb);
            this._slotIcons.push(si);
            this._slotCountTxts.push(sc);
        }

        // 快捷槽区域（背包内显示）
        const qy = ph / 2 - 38;
        const qLabels = ['Z', 'X', 'C'];
        const qsx = -(3 * (SZ + GAP) - GAP) / 2 + SZ / 2;
        for (let qi = 0; qi < 3; qi++) {
            const x = qsx + qi * (SZ + GAP);
            const qb = s.add.rectangle(x, qy, SZ, SZ - 10, 0x1a1a2e, 0.9)
                .setStrokeStyle(2, 0x3333aa).setInteractive();
            qb.on('pointerdown', () => {
                this._selectedQuick = (this._selectedQuick === qi) ? -1 : qi;
                this._refreshHighlights();
            });
            const ql = s.add.text(x - SZ / 2 + 3, qy - (SZ - 10) / 2 + 2, qLabels[qi], {
                fontSize: '15px', color: '#8888ff', fontFamily: '"VT323", monospace'
            });
            this.panel.add([qb, ql]);
        }

        const qTitle = s.add.text(0, qy - (SZ - 10) / 2 - 12, '── QUICK SLOTS ──', {
            fontSize: '20px', color: '#aabbff', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5);
        this.panel.add(qTitle);
    }

    // ── 键盘注册 ─────────────────────────────────────────
    _registerKeys() {
        const s = this.scene;
        const K = Phaser.Input.Keyboard.KeyCodes;
        s.keyZ = s.input.keyboard.addKey(K.Z);
        s.keyX = s.input.keyboard.addKey(K.X);
        s.keyC = s.input.keyboard.addKey(K.C);
        s.keyB = s.input.keyboard.addKey(K.B);
    }

    // ═══════════════════════════════════════════════════
    //  旧 API 兼容（供 GameScene / TutorialScene 等使用）
    // ═══════════════════════════════════════════════════

    /** 获取当前手上的铁镐 */
    getActiveItem() {
        return this.activeHand === 'left' ? this._leftPick : this._rightPick;
    }

    /** 切换左右手 */
    toggleHand() {
        this.activeHand = this.activeHand === 'left' ? 'right' : 'left';
        if (this.scene.player?.pState) this.scene.player.pState.activeHand = this.activeHand;
    }

    /** 旧系统数字键选格子 — 无操作（兼容） */
    selectSlot() {}

    /** 消耗当前活跃物品（铁镐不消耗；供旧代码调用） */
    consumeActiveItem() {}

    /** 对所有相同类型的快捷槽触发 CD */
    startCooldown(durationMs) {
        if (this._activeQuickIdx < 0) return;
        const qi = this._activeQuickIdx;
        const type = this.quickSlots[qi]?.type;
        if (!type) return;
        for (let i = 0; i < 3; i++) {
            if (this.quickSlots[i]?.type === type) {
                this.quickCooldowns[i]    = durationMs;
                this.quickCooldownMaxs[i] = durationMs;
            }
        }
        this.refreshQuick();
    }

    /** 消耗快捷槽物品（Z/X/C 用后调用） */
    consumeQuick(qi) {
        const qs = this.quickSlots[qi];
        if (!qs) return;
        qs.count--;
        if (qs.count <= 0) this.quickSlots[qi] = null;
        // 同步背包（可选：从背包自动补充）
        this.refreshQuick();
    }

    /** 背包是否能放入某类型物品 */
    canAdd(type, count = 1) {
        if (type !== 'pickaxe') {
            for (const s of this.slots) {
                if (s && s.type === type && s.count + count <= 64) return true;
            }
        }
        return this.slots.some(s => s === null);
    }

    /** 添加物品到背包 — 同时刷新背包面板 + 物品栏 (icon/count) */
    addItem(type, count = 1) {
        if (type === 'pickaxe') return true; // 铁镐固定
        // 尝试堆叠
        for (const s of this.slots) {
            if (s && s.type === type && s.count < 64) {
                const can = Math.min(count, 64 - s.count);
                s.count += can; count -= can;
                if (count === 0) {
                    this.refreshBackpack();
                    this.refreshQuick();   // 物品栏 quickslot 也立即同步数量
                    return true;
                }
            }
        }
        // 找空格
        for (let i = 0; i < this.SLOT_COUNT && count > 0; i++) {
            if (!this.slots[i]) {
                this.slots[i] = { type, count: Math.min(count, 64), cooldown: 0, cooldownMax: 0 };
                count -= this.slots[i].count;
            }
        }
        this.refreshBackpack();
        // 自动补充空快捷槽
        this._autoFillQuick(type);
        this.refreshQuick();   // 也刷一次物品栏
        return count === 0;
    }

    /** 每帧更新 */
    update(delta) {
        let dirty = false;
        for (let i = 0; i < 3; i++) {
            if (this.quickCooldowns[i] > 0) {
                this.quickCooldowns[i] = Math.max(0, this.quickCooldowns[i] - delta);
                dirty = true;
            }
        }
        if (dirty) this.refreshQuick();
    }

    // ═══════════════════════════════════════════════════
    //  Z / X / C 快捷键使用
    // ═══════════════════════════════════════════════════
    useQuickSlot(qi) {
        if (qi < 0 || qi > 2) return;
        if (this.quickCooldowns[qi] > 0) return;
        const qs = this.quickSlots[qi];
        if (!qs) return;
        this._activeQuickIdx = qi;   // (用户修复) startCooldown 靠这个标记定位槽位 — 旧底部物品栏路径才设它, C/X 路径漏设 → CD 从来没生效过
        // 阶段 6: 同步最新数量 (避免 stale count)
        this.refreshQuick();
        if (qs.count <= 0) return;  // 没东西不能用

        const s = this.scene;
        if (s.hudSystem?.gamePausedByConfirm) return;
        if (s.shopSystem?.isOpen) return;

        if (qs.type === 'healing_potion') {
            if (s.healthSystem.canHeal()) {
                if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(s, 'DrinkPotion');   // (用户) 治疗药水音效
                s.healthSystem.heal(1);
                this._consumeFromInventory(qs.type, 1);
                this.refreshQuick();
                this.startCooldown(window.AbyssDiff ? AbyssDiff.get().potionCd : 60000);
            } else {
                s.hudSystem.showConfirm('You are already at full HP — no effect.', (yes) => {
                    if (yes) { if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(s, 'DrinkPotion'); this._consumeFromInventory(qs.type, 1); this.refreshQuick(); this.startCooldown(window.AbyssDiff ? AbyssDiff.get().potionCd : 60000); }
                });
            }
        } else if (qs.type === 'health_potion') {
            const now = s.time.now;
            const apply = () => {
                s._diseaseImmuneUntil = now + 30000;   // (用户) 健康药水免疫 60s → 30s
                if (s.diseaseSystem && s.diseaseSystem.cure) s.diseaseSystem.cure();
                if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(s, 'EatPills');   // (用户) 健康药水音效
                this._consumeFromInventory(qs.type, 1);
                this.refreshQuick();
                this.startCooldown(window.AbyssDiff ? AbyssDiff.get().potionCd : 60000);
            };
            // (用户) 只在侵蚀度=0 时弹确认 ("你很健康, 确定用吗"); 免疫期内只要侵蚀>0 照常直接使用, 不再拦
            const corr = (s.diseaseSystem && typeof s.diseaseSystem.corrosionPct === 'number') ? s.diseaseSystem.corrosionPct : 0;
            if (corr <= 0) {
                s.hudSystem.showConfirm('You are healthy. Use it anyway?', (yes) => {
                    if (yes) apply();
                });
            } else {
                apply();
            }
        } else if (qs.type === 'key') {
            // 钥匙不能在这里用 — 走到 KeyDoor interact 自动消耗
            // 这里 do nothing (按 Z 不应该报错)
        }
    }

    /** 从 InventorySystem 消耗 n 个 type, 返回是否成功 */
    _consumeFromInventory(type, n = 1) {
        const inv = this.scene.inventorySystem;
        if (!inv || !inv.slots) return false;
        let remaining = n;
        for (let i = 0; i < inv.SLOT_COUNT && remaining > 0; i++) {
            const slot = inv.slots[i];
            if (slot && slot.type === type && slot.count > 0) {
                const take = Math.min(slot.count, remaining);
                slot.count -= take;
                remaining -= take;
                if (slot.count <= 0) inv.slots[i] = null;
            }
        }
        if (inv.refresh) inv.refresh();
        return remaining === 0;
    }

    // ═══════════════════════════════════════════════════
    //  背包开关
    // ═══════════════════════════════════════════════════
    open() {
        if (this.isOpen) return;
        this.isOpen = true;
        this.panel.setVisible(true);
        this._selectedQuick = -1;
        this._refreshHighlights();
        this.refreshBackpack();
        // 暂停游戏
        this.scene.physics.pause();
        this.scene.game.canvas.style.cursor = 'none';   // (用户修复) 统一精灵光标
        if (this.scene.crosshair) this.scene.crosshair.setVisible(false);
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.scene._suppressNextClick = true;  // 防止关闭点击穿透到攻击
        this.panel.setVisible(false);
        this._selectedQuick = -1;
        this._refreshHighlights();
        this.scene.physics.resume();
        this.scene.game.canvas.style.cursor = 'none';
        if (this.scene.crosshair) this.scene.crosshair.setVisible(true);
    }

    toggle() {
        this.isOpen ? this.close() : this.open();
    }

    // ═══════════════════════════════════════════════════
    //  UI 刷新
    // ═══════════════════════════════════════════════════
    refreshQuick() {
        const SZ = 58;
        const inv = this.scene.inventorySystem;
        for (let i = 0; i < 3; i++) {
            const qs = this.quickSlots[i];
            const icon = this._qIcons[i];
            const cnt  = this._qCounts[i];
            const cd   = this._qCdBars[i];
            if (qs) {
                // 阶段 6: 类型锁定的槽 — 从 InventorySystem 累计 type 的总数量
                if (qs.locked && inv && inv.slots) {
                    let total = 0;
                    for (let k = 0; k < inv.SLOT_COUNT; k++) {
                        if (inv.slots[k] && inv.slots[k].type === qs.type) {
                            total += inv.slots[k].count;
                        }
                    }
                    qs.count = total;
                }
                const tex = this._texKey(qs.type);
                if (tex) {
                    icon.setTexture(tex).setDisplaySize(36, 36).setVisible(true);
                    icon.setAlpha(qs.count > 0 ? 1 : 0.3);  // 空槽: 半透明
                }
                cnt.setText(qs.count.toString()).setVisible(true);
                cnt.setAlpha(qs.count > 0 ? 1 : 0.5);
                cnt.setColor(qs.count > 0 ? '#ffffff' : '#888888');
            } else {
                icon.setVisible(false);
                cnt.setVisible(false);
            }
            // CD bar
            if (this.quickCooldowns[i] > 0 && this.quickCooldownMaxs[i] > 0) {
                const pct = this.quickCooldowns[i] / this.quickCooldownMaxs[i];
                cd.setSize(SZ, SZ * pct).setVisible(true);
            } else {
                cd.setVisible(false);
            }
        }
    }

    refreshBackpack() {
        for (let i = 0; i < this.SLOT_COUNT; i++) {
            const slot = this.slots[i];
            const icon = this._slotIcons[i];
            const cnt  = this._slotCountTxts[i];
            if (slot) {
                const tex = this._texKey(slot.type);
                if (tex) icon.setTexture(tex).setDisplaySize(36, 36).setVisible(true);
                cnt.setText(slot.count > 1 ? slot.count.toString() : '').setVisible(slot.count > 1);
            } else {
                icon.setVisible(false);
                cnt.setVisible(false);
            }
        }
    }

    /** 旧代码可能调用的 refresh() */
    refresh() { this.refreshQuick(); }

    // ═══════════════════════════════════════════════════
    //  内部工具
    // ═══════════════════════════════════════════════════
    _texKey(type) {
        switch (type) {
            case 'pickaxe':        return 'pickaxe_img';
            case 'healing_potion': return (this.scene && this.scene.textures.exists('HpPotion')) ? 'HpPotion' : 'potion_heal_img';
            case 'life_potion':    return 'potion_life_img';
            case 'health_potion':  return 'potion_health_img';
            case 'shield_potion':  return 'potion_shield_img';
            case 'key':            return 'key_img';
            default: return null;
        }
    }

    _onSlotClick(idx) {
        if (this._selectedQuick < 0) return; // 没选快捷槽
        const slot = this.slots[idx];
        if (!slot) return;
        const qi = this._selectedQuick;
        // 阶段 6: 快捷槽已类型锁定, 拒绝拖拽改变类型
        if (this.quickSlots[qi] && this.quickSlots[qi].locked) {
            this._selectedQuick = -1;
            this._refreshHighlights();
            return;
        }
        // 把物品从背包移到快捷槽 (老逻辑保留, 但 locked 槽不会走到这里)
        if (this.quickSlots[qi]) {
            this.addItem(this.quickSlots[qi].type, this.quickSlots[qi].count);
        }
        this.quickSlots[qi] = { type: slot.type, count: slot.count, cooldown: 0, cooldownMax: 0 };
        this.slots[idx] = null;
        this._selectedQuick = -1;
        this._refreshHighlights();
        this.refreshBackpack();
        this.refreshQuick();
    }

    _refreshHighlights() {
        for (let i = 0; i < 3; i++) {
            this._qHighlights[i].setVisible(this._selectedQuick === i);
        }
    }

    _autoFillQuick(type) {
        // 阶段 6: 快捷槽已类型锁定, 不需要 auto-fill (refreshQuick 自己同步)
        // 保留方法不报错, 触发 refreshQuick 即可
        this.refreshQuick();
    }

    /** 供 InteractSystem 检查背包里的钥匙 */
    hasKey() {
        return this.quickSlots.some(q => q?.type === 'key') ||
               this.slots.some(s => s?.type === 'key');
    }

    /** 消耗一把钥匙 */
    consumeKey() {
        for (let i = 0; i < 3; i++) {
            if (this.quickSlots[i]?.type === 'key') {
                this.consumeQuick(i); return;
            }
        }
        for (let i = 0; i < this.SLOT_COUNT; i++) {
            if (this.slots[i]?.type === 'key') {
                this.slots[i].count--;
                if (this.slots[i].count <= 0) this.slots[i] = null;
                this.refreshBackpack(); return;
            }
        }
    }

    /** 供 uiCam.ignore() 调用：返回所有快捷槽和面板对象 */
    getAllUIObjects() {
        const objs = [...(this._qAllObjects || [])];
        if (this.panel) objs.push(this.panel);
        return objs;
    }

    /** 显示/隐藏右下快捷槽 */
    setHotbarVisible(visible) {
        if (!this._qAllObjects) return;
        this._qAllObjects.forEach(o => {
            if (o && o.setVisible) {
                // 保留对象自己的"empty 槽不可见"状态：
                // 仅在设为 false 时强制隐藏，true 时只显示框/按键标签（数量/icon/cd 由 refresh 决定）
                if (visible) {
                    // bg 和 keyLbl 总是显示
                    if (this._qBgs.includes(o) || this._qAllObjects.indexOf(o) % 6 === 3) {
                        o.setVisible(true);
                    }
                } else {
                    o.setVisible(false);
                }
            }
        });
        // 简化：完全 hide / show 全部
        if (visible) {
            // 重新刷新（让数量、cd、icon 根据实际状态显示）
            this._qBgs.forEach(b => b.setVisible(true));
            // keyLbl 通过对象数组找出（每槽对象顺序：bg, hl, icon, keyLbl, cntTxt, cdBar）
            for (let i = 0; i < this._qBgs.length; i++) {
                const baseIdx = i * 6;
                const keyLbl = this._qAllObjects[baseIdx + 3];
                if (keyLbl) keyLbl.setVisible(true);
            }
            // 调 refreshQuick 让 icon/count/cd 根据实际状态显示 (BackpackSystem 实际方法名是 refreshQuick, 之前是 _refreshQuickSlots 笔误导致 icon 不刷新)
            if (this.refreshQuick) this.refreshQuick();
        }
    }
}