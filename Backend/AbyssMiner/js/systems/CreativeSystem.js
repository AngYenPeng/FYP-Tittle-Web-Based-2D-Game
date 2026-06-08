/**
 * CreativeSystem — 创造模式（关卡编辑器）
 *
 * 操作规则：
 *   - 左键：只点 UI 按钮（笔刷选择、Export、Import、Undo、Redo、关闭）
 *   - 右键：
 *       笔刷 wall/air/platform → 替换该格方块（覆盖原本的）
 *       笔刷 erase → 回退该格历史一步（撤销最后一次该格的修改）
 *
 * 历史系统：
 *   - 每格独立维护一个历史栈：cellHistory.get('col,row') = [block1, block2, ...]
 *   - 全局历史栈：globalHistory = [{col, row, prevType, newType}, ...]
 *   - Undo：撤销全局最后一步
 *   - Redo：重做最近被 Undo 的步骤
 *
 * 数据流：
 *   gridSystem 是真值，皮肤渲染读 gridSystem
 *   修改方块 → 更新 gridSystem → 重画皮肤 → 物理同步
 */
class CreativeSystem {
    constructor(scene) {
        this.scene = scene;
        this.isOpen = false;
        this.panel = null;
        this.currentBrush = 'wall';

        // (用户) 隐藏解锁: 游戏内连按 1 2 2 3 3 4 4 5 5 6 6 7 7 8 8 9 9 0 打开创造模式.
        // 按错任意按键(WASD/空格等都算) 或点任何鼠标键 → 已输入全部清空重来.
        this._pwSeq = '122334455667788990';
        this._pwProgress = 0;
        this._pwUnlocked = false;   // 仅本次进图有效 — 场景重建即重置, 必须重新输密码
        try {
            scene.input.keyboard.on('keydown', (ev) => {
                if (ev.repeat) return;   // 长按产生的重复不算新按键
                const k = ev.key;
                if (k === this._pwSeq[this._pwProgress]) {
                    this._pwProgress++;
                    if (this._pwProgress >= this._pwSeq.length) {
                        this._pwProgress = 0;
                        if (!(scene._cinematicLock || (scene.dialogSystem && scene.dialogSystem.isOpen))) {
                            this._pwUnlocked = true;
                            if (scene.hudSystem && scene.hudSystem.creativeBtn) scene.hudSystem.creativeBtn.setVisible(true);
                            this.toggle();
                        }
                    }
                } else {
                    // 错一键全清; 若该键恰是序列第一位, 视为新一轮的开始
                    this._pwProgress = (k === this._pwSeq[0]) ? 1 : 0;
                }
            });
            scene.input.on('pointerdown', () => { this._pwProgress = 0; });
        } catch (e) {}

        // 每格独立历史栈：key = "col,row"，值 = [type1, type2, ...]
        this.cellHistory = new Map();
        // 全局历史（用于 Undo/Redo）
        this.globalHistory = [];
        this.redoStack = [];
        // 创造模式放置的门追踪：[{type, c1, r1, c2, r2, obj}]
        this._placedDoors = [];
    }

    init() {
        this._buildPanel();
    }

    _buildPanel() {
        const s = this.scene;
        const W = s.cameras.main.width;
        const H = s.cameras.main.height;

        this.panel = s.add.container(W / 2, H - 80)
            .setScrollFactor(0).setDepth(960).setVisible(false);

        const PW = 800, PH = 130;
        const bg = s.add.rectangle(0, 0, PW, PH, 0x0a0a18, 0.95)
            .setStrokeStyle(2, 0x4488cc);

        // 标题（动态：显示当前位置）
        this._titleText = s.add.text(0, -PH / 2 + 10, '', {
            fontSize: '17px', color: '#88ccff', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5);

        // 关闭按钮
        const closeBtn = s.add.text(PW / 2 - 14, -PH / 2 + 12, '✕', {
            fontSize: '20px', color: '#ff5555', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5).setInteractive();
        closeBtn.on('pointerdown', (ptr) => { if (ptr.button === 0) this.close(); });

        // ── 笔刷分类定义 ──────────────────────────────
        this._brushCategories = {
            'Walls':    [
                { key: 'wall',     label: 'Cavetile Wall', color: '#ffffff' },
            ],
            'Blocks':   [
                { key: 'platform', label: 'Platform',      color: '#aa8855' },
                { key: 'air',      label: 'Air',           color: '#88ccff' },
                { key: 'bg_block', label: 'BG Block',      color: '#446688' },
                { key: 'crystal',  label: 'Crystal Block', color: '#66ffff' },
                { key: 'y_crystal',label: 'Yellow Crystal',color: '#ffcc33' },
            ],
            'Doors':    [
                { key: 'stone_door',   label: 'Stone Door',   color: '#aa6644' },
                { key: 'crystal_door', label: 'Crystal Door', color: '#66ccff' },
                { key: 'key_door',     label: 'Key Door',     color: '#ffcc44' },
                { key: 'secret_door',  label: 'Secret Door',  color: '#aa66ff' },
            ],
            'Entities': [
                { key: 'spider',         label: 'Hunter Spider',  color: '#cc66cc' },
                { key: 'bungee_spider',  label: 'Bungee Spider',  color: '#aa44aa' },
                { key: 'bat',            label: 'Crystal Bat',    color: '#ccccff' },
                { key: 'earthworm',      label: 'Earthworm',      color: '#cc8866' },
                { key: 'slime',          label: 'Crystal Slime',  color: '#88ff88' },
                { key: 'beetle',         label: 'Hardrock Beetle',color: '#888888' },
                { key: 'mimic_ore',      label: 'Mimic Ore',      color: '#ffaa44' },
                { key: 'volatile',       label: 'Volatile Crystal', color: '#ff6666' },
            ],
            'Hazards':  [
                { key: 'thorns',     label: 'Thorns',      color: '#cc4455' },
                { key: 'stalactite', label: 'Stalactite',  color: '#9aa8bb' },
                { key: 'bat_nest',   label: 'Bat Nest',    color: '#7755bb' },
            ],
            'Tools':    [
                { key: 'erase',  label: 'Erase (undo cell)', color: '#ff8866' },
            ],
        };

        // 内容容器（分类视图 / 笔刷视图）
        this._contentContainer = s.add.container(0, 8);
        this.panel.add([bg, this._titleText, closeBtn, this._contentContainer]);

        // ── Undo / Redo / Export / Import / Back（始终显示）──
        const rightX = PW / 2 - 90;
        this._undoBtn = s.add.text(PW / 2 - 250, -PH / 2 + 35, '[ Undo ]', {
            fontSize: '17px', color: '#ffaa66', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3
        }).setOrigin(0, 0.5).setInteractive();
        this._undoBtn.on('pointerdown', (ptr) => { if (ptr.button === 0) this.undo(); });
        this._undoBtn.on('pointerover', () => this._undoBtn.setAlpha(0.7));
        this._undoBtn.on('pointerout',  () => this._undoBtn.setAlpha(1));

        this._redoBtn = s.add.text(PW / 2 - 175, -PH / 2 + 35, '[ Redo ]', {
            fontSize: '17px', color: '#66ff88', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3
        }).setOrigin(0, 0.5).setInteractive();
        this._redoBtn.on('pointerdown', (ptr) => { if (ptr.button === 0) this.redo(); });
        this._redoBtn.on('pointerover', () => this._redoBtn.setAlpha(0.7));
        this._redoBtn.on('pointerout',  () => this._redoBtn.setAlpha(1));

        this._exportBtn = s.add.text(rightX, -PH / 2 + 35, '[ Export ]', {
            fontSize: '17px', color: '#ffcc55', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3
        }).setOrigin(0, 0.5).setInteractive();
        this._exportBtn.on('pointerdown', (ptr) => { if (ptr.button === 0) this._export(); });

        this._importBtn = s.add.text(rightX, -PH / 2 + 60, '[ Import ]', {
            fontSize: '17px', color: '#66ff88', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3
        }).setOrigin(0, 0.5).setInteractive();
        this._importBtn.on('pointerdown', (ptr) => { if (ptr.button === 0) this._import(); });

        // Back 按钮（在笔刷视图时显示）
        this._backBtn = s.add.text(-PW / 2 + 20, -PH / 2 + 35, '[ ← Back ]', {
            fontSize: '17px', color: '#ffff66', fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 3
        }).setOrigin(0, 0.5).setInteractive().setVisible(false);
        this._backBtn.on('pointerdown', (ptr) => {
            if (ptr.button === 0) this._showCategories();
        });
        this._backBtn.on('pointerover', () => this._backBtn.setAlpha(0.7));
        this._backBtn.on('pointerout',  () => this._backBtn.setAlpha(1));

        this.panel.add([this._undoBtn, this._redoBtn, this._exportBtn, this._importBtn, this._backBtn]);

        // 默认显示分类视图
        this._showCategories();
    }

    /** 显示分类视图：列出所有分类按钮 */
    _showCategories() {
        // 清空内容容器
        this._contentContainer.removeAll(true);

        this._titleText.setText('CREATIVE MODE  —  Select a Category');
        this._backBtn.setVisible(false);

        const cats = Object.keys(this._brushCategories);
        const PW = 800;
        const startX = -PW / 2 + 40;
        const spacing = 140;
        cats.forEach((cat, i) => {
            const x = startX + i * spacing;
            const btn = this.scene.add.text(x, 28, '[ ' + cat + ' ]', {
                fontSize: '22px', color: '#ffffff', fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 3
            }).setOrigin(0, 0.5).setInteractive();
            btn.on('pointerdown', (ptr) => {
                if (ptr.button === 0) this._showBrushes(cat);
            });
            btn.on('pointerover', () => btn.setColor('#ffff66'));
            btn.on('pointerout',  () => btn.setColor('#ffffff'));
            this._contentContainer.add(btn);
        });
    }

    /** 显示某分类下的笔刷视图 */
    _showBrushes(catName) {
        this._contentContainer.removeAll(true);

        this._titleText.setText('CREATIVE MODE — ' + catName + '  (RMB to place)');
        this._backBtn.setVisible(true);

        const brushes = this._brushCategories[catName] || [];
        this._brushButtons = {};
        const PW = 800;
        const PER_ROW = 4;          // 每行 4 个
        const startX = -PW / 2 + 130;
        const colSpacing = 165;
        const rowSpacing = 26;
        brushes.forEach((b, i) => {
            const col = i % PER_ROW;
            const row = Math.floor(i / PER_ROW);
            const x = startX + col * colSpacing;
            const y = 18 + row * rowSpacing;
            const btn = this.scene.add.text(x, y, '[ ' + b.label + ' ]', {
                fontSize: '15px', color: b.color, fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 3
            }).setOrigin(0, 0.5).setInteractive();
            btn.on('pointerdown', (ptr) => {
                if (ptr.button !== 0) return;
                this._selectBrush(b.key);
            });
            btn.on('pointerover', () => btn.setAlpha(0.7));
            btn.on('pointerout',  () => btn.setAlpha(1));
            this._brushButtons[b.key] = btn;
            this._contentContainer.add(btn);
        });
        this._refreshBrushHighlight();
    }

    _selectBrush(key) {
        this.currentBrush = key;
        this._refreshBrushHighlight();
    }

    _refreshBrushHighlight() {
        for (const [k, btn] of Object.entries(this._brushButtons)) {
            btn.setBackgroundColor(k === this.currentBrush ? '#003366' : '');
        }
    }

    open() {
        if (this.isOpen) return;
        this.isOpen = true;
        this.panel.setVisible(true);
        this._installPointerHandler();
        // 无敌 + 怪物冻结（怪物 update 检查这个 flag）
        this.scene._creativeInvincible = true;
        // 冻结所有怪物速度
        this._freezeMonsters(true);
        // === 玩家飞行模式: 关重力, WASD 自由移动 ===
        this.scene._creativeFly = true;
        if (this.scene.player && this.scene.player.body) {
            this._savedPlayerAllowGravity = this.scene.player.body.allowGravity;
            this.scene.player.body.setAllowGravity(false);
            this.scene.player.body.setVelocity(0, 0);
            // 清除可能的特殊状态 (蹲/挂/冲)
            if (this.scene.isCrouching) {
                this.scene.isCrouching = false;
                this.scene.player.body.setSize(32, 48);   // (用户·双箱制)
                this.scene.player.setOrigin(this.scene.player.flipX ? 0.5625 : 0.4375, 0.5);
                this.scene.player.body.setOffset(this.scene.player.flipX ? 56 : 40, 61);   // (用户) 倾斜对
            }
            this.scene.isHanging = false;
            this.scene.isGrappling = false;
            this.scene.isDashing = false;
        }
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.scene._suppressNextClick = true;
        this.panel.setVisible(false);
        this._uninstallPointerHandler();
        this.scene._creativeInvincible = false;
        this._freezeMonsters(false);
        // === 关闭飞行: 恢复重力 ===
        this.scene._creativeFly = false;
        if (this.scene.player && this.scene.player.body) {
            this.scene.player.body.setAllowGravity(this._savedPlayerAllowGravity ?? true);
        }
    }

    _freezeMonsters(freeze) {
        // 只冻 velocity + AI active, 不碰 gravity!
        // 创造模式只有玩家无视重力, 怪物保留原本的物理 (蝙蝠飞, 其他受重力)
        // 这样如果怪物脚下的墙被删, 它会自然掉落 (蝙蝠不掉, 别的会掉)
        const s = this.scene;
        const groups = ['spiders', 'bungeeSpiders', 'bats', 'earthworms',
                       'slimes', 'miniSlimes', 'beetles', 'volatileCrystals',
                       'mimicOres', 'cowardMimics'];
        groups.forEach(g => {
            if (!s[g] || !s[g].getChildren) return;
            s[g].getChildren().forEach(m => {
                if (!m || !m.body) return;
                if (freeze) {
                    m._savedActive = m.active;
                    m.body.setVelocity(0, 0);
                    m.active = false;  // 停止 preUpdate 调用 (冻 AI)
                } else {
                    m.active = m._savedActive ?? true;
                }
            });
        });
    }

    toggle() {
        this.isOpen ? this.close() : this.open();
    }

    _installPointerHandler() {
        if (this._pointerHandler) return;

        // 右键 down → 开始拖拽 + 填第一格
        this._pointerHandler = (pointer) => {
            if (!this.isOpen) return;
            if (!this.scene.gridSystem) return;
            if (pointer.button !== 2) return;
            if (this._isOverPanel(pointer)) return;
            this._isDragging = true;
            this._lastDragCell = null;
            this._placeAtPointer(pointer);
        };

        // 拖拽中 — 鼠标 move 沿路填
        this._pointerMoveHandler = (pointer) => {
            if (!this._isDragging) return;
            if (!this.isOpen) return;
            if (!this.scene.gridSystem) return;
            if (this._isOverPanel(pointer)) return;
            this._placeAtPointer(pointer);
        };

        // 鼠标 up → 停止拖拽
        this._pointerUpHandler = (pointer) => {
            if (pointer.button === 2 || pointer.buttons === 0) {
                this._isDragging = false;
                this._lastDragCell = null;
            }
        };

        this.scene.input.on('pointerdown', this._pointerHandler);
        this.scene.input.on('pointermove', this._pointerMoveHandler);
        this.scene.input.on('pointerup', this._pointerUpHandler);
        this.scene.input.mouse.disableContextMenu();
    }

    /** 在 pointer 当前位置放置，自动用 Bresenham 填补与上次格子之间的缝 */
    _placeAtPointer(pointer) {
        const cam = this.scene.cameras.main;
        const wx = cam.scrollX + (pointer.x - cam.width / 2) / cam.zoom + cam.width / 2;
        const wy = cam.scrollY + (pointer.y - cam.height / 2) / cam.zoom + cam.height / 2;
        const col = Math.floor(wx / 32);
        const row = Math.floor(wy / 32);

        // 去重 — 同格不重复处理
        if (this._lastDragCell &&
            this._lastDragCell.col === col &&
            this._lastDragCell.row === row) return;

        // Bresenham 线插值（让快速拖拽不会漏格）
        const cells = this._lastDragCell
            ? this._bresenham(this._lastDragCell.col, this._lastDragCell.row, col, row)
            : [{ col, row }];

        for (const cell of cells) {
            if (this.currentBrush === 'erase') {
                this._undoCell(cell.col, cell.row);
            } else {
                this._setCellType(cell.col, cell.row, this._brushToType(this.currentBrush));
            }
            const grid = this.scene.gridSystem;
            const gCol = cell.col - Math.floor((grid?.originX || 0) / 32);
            const gRow = cell.row - Math.floor((grid?.originY || 0) / 32);
            this._refreshSkin({ col: gCol, row: gRow });
        }

        this._lastDragCell = { col, row };
    }

    _bresenham(x0, y0, x1, y1) {
        const cells = [];
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;
        let x = x0, y = y0;
        let steps = 0;
        while (steps++ < 200) {  // 安全上限
            cells.push({ col: x, row: y });
            if (x === x1 && y === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x += sx; }
            if (e2 < dx)  { err += dx; y += sy; }
        }
        return cells;
    }

    _uninstallPointerHandler() {
        if (this._pointerHandler) {
            this.scene.input.off('pointerdown', this._pointerHandler);
            this._pointerHandler = null;
        }
        if (this._pointerMoveHandler) {
            this.scene.input.off('pointermove', this._pointerMoveHandler);
            this._pointerMoveHandler = null;
        }
        if (this._pointerUpHandler) {
            this.scene.input.off('pointerup', this._pointerUpHandler);
            this._pointerUpHandler = null;
        }
        this._isDragging = false;
        this._lastDragCell = null;
    }

    _isOverPanel(pointer) {
        if (!this.panel || !this.panel.visible) return false;
        const px = pointer.x, py = pointer.y;
        const cx = this.panel.x, cy = this.panel.y;
        return Math.abs(px - cx) < 360 && Math.abs(py - cy) < 60;
    }

    _brushToType(brush) {
        // 笔刷 key 直接当 type 用，create 时 switch 处理
        return brush;
    }

    /**
     * 设置某格的类型（替换语义）
     * 1. 删掉该格旧的物理对象
     * 2. 创建新对象
     * 3. 推入历史栈
     */
    _setCellType(col, row, newType) {
        const cx = col * 32 + 16;
        const cy = row * 32 + 16;
        const key = col + ',' + row;

        // 当前该格的类型（用于历史）
        const prevType = this._getCellCurrentType(col, row);
        if (prevType === newType) return; // 没变化

        // 1. 删掉该格旧对象
        this._removeCellObjects(col, row);

        // 2. 创建新对象
        this._createCellByType(cx, cy, newType);

        // 3. 推入历史栈
        if (!this.cellHistory.has(key)) this.cellHistory.set(key, []);
        this.cellHistory.get(key).push(newType);
        this.globalHistory.push({ col, row, prevType, newType });
        this.redoStack = []; // 新动作清空 redo
    }

    /** Erase 笔刷：撤销该格最近一次修改 */
    _undoCell(col, row) {
        const key = col + ',' + row;
        const hist = this.cellHistory.get(key);

        const cx = col * 32 + 16;
        const cy = row * 32 + 16;

        const currentType = this._getCellCurrentType(col, row);
        console.log('[Erase] (' + col + ',' + row + ') currentType=' + currentType + ' hist=' + JSON.stringify(hist));

        if (!hist || hist.length === 0) {
            if (currentType === 'air') {
                console.log('[Erase] already air, skip');
                return;
            }
            console.log('[Erase] no history, removing current ' + currentType);
            this._removeCellObjects(col, row);
            this.globalHistory.push({ col, row, prevType: currentType, newType: 'air' });
            this.redoStack = [];
            return;
        }

        const popped = hist.pop();
        let revertTo;
        if (hist.length > 0) {
            revertTo = hist[hist.length - 1];
        } else {
            revertTo = 'air';
        }
        console.log('[Erase] popped=' + popped + ' revertTo=' + revertTo);

        this._removeCellObjects(col, row);
        this._createCellByType(cx, cy, revertTo);
        this.globalHistory.push({ col, row, prevType: currentType, newType: revertTo });
        this.redoStack = [];
    }

    /** Undo 全局历史一步 */
    undo() {
        if (this.globalHistory.length === 0) return;
        const action = this.globalHistory.pop();
        this.redoStack.push(action);
        const cx = action.col * 32 + 16;
        const cy = action.row * 32 + 16;
        this._removeCellObjects(action.col, action.row);
        this._createCellByType(cx, cy, action.prevType);
        // 同步 cellHistory
        const key = action.col + ',' + action.row;
        const hist = this.cellHistory.get(key);
        if (hist && hist.length > 0) hist.pop();
        this._refreshSkin();
    }

    redo() {
        if (this.redoStack.length === 0) return;
        const action = this.redoStack.pop();
        this.globalHistory.push(action);
        const cx = action.col * 32 + 16;
        const cy = action.row * 32 + 16;
        this._removeCellObjects(action.col, action.row);
        this._createCellByType(cx, cy, action.newType);
        const key = action.col + ',' + action.row;
        if (!this.cellHistory.has(key)) this.cellHistory.set(key, []);
        this.cellHistory.get(key).push(action.newType);
        this._refreshSkin();
    }

    /** 获取该格当前类型（读 gridSystem） */
    /** 获取该格当前类型（读 gridSystem + 怪物组） */
    _getCellCurrentType(col, row) {
        const cx = col * 32 + 16;
        const cy = row * 32 + 16;
        // 先检查怪物（怪物在 air 格上）
        const monsterType = this._getMonsterAt(cx, cy);
        if (monsterType) return monsterType;
        // 再检查 GridSystem（转换世界 col/row 到 grid index）
        const grid = this.scene.gridSystem;
        const gCol = col - Math.floor((grid.originX || 0) / 32);
        const gRow = row - Math.floor((grid.originY || 0) / 32);
        const t = grid.getType(gCol, gRow);
        if (t === GridSystem.WALL) return 'wall';
        if (t === GridSystem.PLATFORM) return 'platform';
        if (t === GridSystem.DOOR) return 'wall'; // 门当墙处理
        if (t === GridSystem.BLOCK) {
            // 区分 蓝水晶 vs 黄水晶 — 检查 _yCrystalOres 是否在此格
            if (this.scene._yCrystalOres) {
                for (const yo of this.scene._yCrystalOres) {
                    if (yo && !yo.destroyed && Math.abs(yo.x - cx) < 16 && Math.abs(yo.y - cy) < 16) {
                        return 'y_crystal';
                    }
                }
            }
            return 'crystal';
        }
        return 'air';
    }

    /** 检查 (cx, cy) 处有没有怪物 */
    _getMonsterAt(cx, cy) {
        const groupToType = {
            'spiders':         'spider',
            'bungeeSpiders':   'bungee_spider',
            'bats':            'bat',
            'earthworms':      'earthworm',
            'slimes':          'slime',
            'beetles':         'beetle',
            'mimicOres':       'mimic_ore',
            'volatileCrystals':'volatile',
        };
        for (const [grpName, brushType] of Object.entries(groupToType)) {
            const grp = this.scene[grpName];
            if (!grp || !grp.getChildren) continue;
            for (const m of grp.getChildren()) {
                if (m && Math.abs(m.x - cx) < 24 && Math.abs(m.y - cy) < 24) {
                    return brushType;
                }
            }
        }
        return null;
    }

    /** 删掉该格上的所有物理对象 + 视觉对象 */
    _removeCellObjects(col, row) {
        const cx = col * 32 + 16;
        const cy = row * 32 + 16;

        // 把 gridSystem 改为 AIR（之后再创建会重新 mark）
        if (this.scene.gridSystem) {
            this.scene.gridSystem.markRect(cx, cy, 32, 32, GridSystem.AIR);
        }
        // 从 wallRects 移除
        if (this.scene.wallRects) {
            this.scene.wallRects = this.scene.wallRects.filter(r => {
                const rxc = r.x + r.width / 2;
                const ryc = r.y + r.height / 2;
                return !(Math.abs(rxc - cx) < 16 && Math.abs(ryc - cy) < 16);
            });
        }
        // 删掉 walls 组中该格的物体
        if (this.scene.walls) {
            const toRemove = [];
            this.scene.walls.getChildren().forEach(w => {
                if (Math.abs(w.x - cx) < 16 && Math.abs(w.y - cy) < 16) {
                    toRemove.push(w);
                }
            });
            toRemove.forEach(w => w.destroy());
        }
        // 删掉 CrystalBlock
        if (this.scene._crystalOres) {
            this.scene._crystalOres = this.scene._crystalOres.filter(ore => {
                if (!ore || ore.destroyed) return false;
                if (Math.abs(ore.x - cx) < 16 && Math.abs(ore.y - cy) < 16) {
                    if (ore.sprite) ore.sprite.destroy();
                    ore.destroyed = true;
                    return false;
                }
                return true;
            });
        }
        // 删掉 YCrystalBlock (黄水晶)
        if (this.scene._yCrystalOres) {
            this.scene._yCrystalOres = this.scene._yCrystalOres.filter(ore => {
                if (!ore || ore.destroyed) return false;
                if (Math.abs(ore.x - cx) < 16 && Math.abs(ore.y - cy) < 16) {
                    if (ore.sprite) ore.sprite.destroy();
                    ore.destroyed = true;
                    return false;
                }
                return true;
            });
        }
        // 删掉 Thorns / Stalactite / BatNest (创造模式放置的危险物)
        if (this.scene._thorns) {
            this.scene._thorns = this.scene._thorns.filter(t => {
                if (!t) return false;
                if (Math.abs(t.x - cx) < 16 && Math.abs(t.y - cy) < 16) {
                    if (t.destroy) t.destroy();
                    return false;
                }
                return true;
            });
        }
        if (this.scene._stalactites) {
            this.scene._stalactites = this.scene._stalactites.filter(st => {
                if (!st) return false;
                const sy = (st.ceilingY != null) ? st.ceilingY + 16 : st.y;
                if (Math.abs(st.x - cx) < 16 && Math.abs(sy - cy) < 24) {
                    if (st.sprite) { try { st.sprite.destroy(); } catch(e) {} }
                    if (st._telegraph) { try { st._telegraph.destroy(); } catch(e) {} }
                    return false;
                }
                return true;
            });
        }
        if (this.scene._batNests) {
            this.scene._batNests = this.scene._batNests.filter(n => {
                if (!n) return false;
                if (Math.abs(n.x - cx) < 16 && Math.abs(n.y - cy) < 16) {
                    if (n.stopSummoning) n.stopSummoning();
                    if (n.destroy) n.destroy();
                    return false;
                }
                return true;
            });
        }
        // 兜底：扫 scene 上的 Crystal_block_* 贴图（防止 _crystalOres 没注册的情况）
        this.scene.children.list.slice().forEach(c => {
            if (!c || !c.texture || !c.texture.key) return;
            if (c.texture.key.startsWith('Crystal_block_') &&
                Math.abs(c.x - cx) < 16 && Math.abs(c.y - cy) < 16) {
                c.destroy();
            }
        });
        // 删除该格上的门（如果删一格 → 整个门都消失，简化处理）
        const doorIdx = this._placedDoors.findIndex(d =>
            col >= d.c1 && col <= d.c2 && row >= d.r1 && row <= d.r2);
        if (doorIdx >= 0) {
            const d = this._placedDoors[doorIdx];
            if (d.obj) {
                if (d.obj.rect) d.obj.rect.destroy();
                if (d.obj.label) d.obj.label.destroy();
                if (d.obj.cracks) d.obj.cracks.destroy();
            }
            // grid unmark 整个门覆盖区
            if (this.scene.gridSystem) {
                for (let r = d.r1; r <= d.r2; r++) {
                    for (let c = d.c1; c <= d.c2; c++) {
                        this.scene.gridSystem.markRect(c * 32 + 16, r * 32 + 16, 32, 32, GridSystem.AIR);
                    }
                }
            }
            this._placedDoors.splice(doorIdx, 1);
        }
        // 删掉 walls staticGroup 不会包括的怪物 — 检查 spiders/bats 等
        ['spiders', 'bats', 'bungeeSpiders', 'earthworms', 'slimes', 'beetles', 'volatileCrystals', 'mimicOres'].forEach(grpName => {
            const grp = this.scene[grpName];
            if (!grp || !grp.getChildren) return;
            const toRemove = [];
            grp.getChildren().forEach(m => {
                if (m && Math.abs(m.x - cx) < 24 && Math.abs(m.y - cy) < 24) {
                    toRemove.push(m);
                }
            });
            toRemove.forEach(m => m.destroy());
        });

        // 删 BackgroundBlock
        if (this.scene._backgroundBlocks) {
            this.scene._backgroundBlocks = this.scene._backgroundBlocks.filter(bg => {
                if (!bg || !bg.image || !bg.image.scene) return false;
                if (Math.abs(bg.x - cx) < 16 && Math.abs(bg.y - cy) < 16) {
                    bg.image.destroy();
                    return false;
                }
                return true;
            });
        }
        // 删 SecretDoor（覆盖范围更大 96x96）
        if (this.scene._secretDoors) {
            this.scene._secretDoors = this.scene._secretDoors.filter(door => {
                if (!door || door._destroyed) return false;
                if (Math.abs(door.x - cx) < 48 && Math.abs(door.y - cy) < 48) {
                    door.destroy();
                    return false;
                }
                return true;
            });
        }
    }

    /** 在 (cx, cy) 创建指定类型方块 */
    _createCellByType(cx, cy, type) {
        const scene = this.scene;
        switch (type) {
            case 'wall':     new CavetileWall(scene, cx, cy, 32, 32); break;
            case 'platform': new PlatformBlock(scene, cx, cy, 32, 32); break;
            case 'crystal':
                if (typeof CrystalBlock !== 'undefined') {
                    const ore = new CrystalBlock(scene, cx, cy, { hp: 18, dropCount: 1 });
                    if (!scene._crystalOres) scene._crystalOres = [];
                    scene._crystalOres.push(ore);
                    // 让镜头不渲染水晶 sprite（避免双层贴图，参考 ignoreFromUI）
                    if (scene.uiCam && ore.sprite) {
                        try { scene.uiCam.ignore(ore.sprite); } catch(e) {}
                    }
                }
                break;
            case 'y_crystal':
                if (typeof YCrystalBlock !== 'undefined') {
                    const yore = new YCrystalBlock(scene, cx, cy, { hp: 12, dropCount: 1 });
                    if (!scene._yCrystalOres) scene._yCrystalOres = [];
                    scene._yCrystalOres.push(yore);
                    if (scene.uiCam && yore.sprite) {
                        try { scene.uiCam.ignore(yore.sprite); } catch(e) {}
                    }
                }
                break;
            case 'stone_door':
                this._placeOrMergeDoor('stone_door', cx, cy);
                break;
            case 'crystal_door':
                this._placeOrMergeDoor('crystal_door', cx, cy);
                break;
            case 'key_door':
                this._placeOrMergeDoor('key_door', cx, cy);
                break;
            case 'spider':
                this._spawnMonster('CrystalHunterSpider', 'spiders', cx, cy);
                break;
            case 'bungee_spider':
                this._spawnMonster('CrystalBungeeSpider', 'bungeeSpiders', cx, cy);
                break;
            case 'bat':
                this._spawnMonster('CrystalBat', 'bats', cx, cy);
                break;
            case 'earthworm':
                this._spawnMonster('CrystalEarthworm', 'earthworms', cx, cy);
                break;
            case 'slime':
                this._spawnMonster('CrystalSlime', 'slimes', cx, cy);
                break;
            case 'beetle':
                this._spawnMonster('HardrockBeetle', 'beetles', cx, cy);
                break;
            case 'mimic_ore':
                this._spawnMonster('MimicOre', 'mimicOres', cx, cy);
                break;
            case 'volatile':
                this._spawnMonster('VolatileCrystal', 'volatileCrystals', cx, cy);
                break;
            case 'bg_block':
                if (typeof BackgroundBlock !== 'undefined') {
                    const bg = new BackgroundBlock(scene, cx, cy, 32, 32);
                    if (!scene._backgroundBlocks) scene._backgroundBlocks = [];
                    scene._backgroundBlocks.push(bg);
                    if (scene.uiCam && bg.image) {
                        try { scene.uiCam.ignore(bg.image); } catch(e) {}
                    }
                }
                break;
            case 'secret_door':
                if (typeof SecretDoor !== 'undefined') {
                    // 3x3 格 = 96x96，但放置点是中心，所以以点击格为中心
                    // 使用 placedBlocks 索引作 pairId（连续放的两扇门会自动配对）
                    if (!scene._secretDoors) scene._secretDoors = [];
                    // pairId：取当前 secret door 数量，相邻偶数配对（0&1, 2&3...）
                    const idx = scene._secretDoors.length;
                    const pairId = 'pair_' + Math.floor(idx / 2);
                    const door = new SecretDoor(scene, cx, cy, { w: 96, h: 96, pairId });
                    scene._secretDoors.push(door);
                }
                break;
            case 'thorns':
                if (typeof Thorns !== 'undefined') {
                    const th = new Thorns(scene, Math.floor(cx / 32), Math.floor(cy / 32));
                    th.update = function() {};  // creative 模式冻结 (编辑时不扣血)
                }
                break;
            case 'stalactite':
                if (typeof Stalactite !== 'undefined') {
                    const st = new Stalactite(scene, cx, { mode: 'ceiling', ceilingY: cy - 16 });
                    st.update = function() {};  // creative 模式冻结 (编辑时不下落)
                }
                break;
            case 'bat_nest':
                if (typeof BatNest !== 'undefined') {
                    new BatNest(scene, Math.floor(cx / 32), Math.floor(cy / 32));  // 自注册 _batNests + uiCam.ignore; 不召唤直到 startSummoning
                }
                break;
            case 'air':      /* 不创建任何对象 */ break;
        }
    }

    /** 通用怪物生成 + 让 uiCam ignore */
    _spawnMonster(className, groupName, cx, cy) {
        const scene = this.scene;
        // 用查表（class 直接引用，避免 window[] 在某些环境下不工作）
        const classMap = {
            'CrystalHunterSpider': typeof CrystalHunterSpider !== 'undefined' ? CrystalHunterSpider : null,
            'CrystalBungeeSpider': typeof CrystalBungeeSpider !== 'undefined' ? CrystalBungeeSpider : null,
            'CrystalBat':          typeof CrystalBat          !== 'undefined' ? CrystalBat          : null,
            'CrystalEarthworm':    typeof CrystalEarthworm    !== 'undefined' ? CrystalEarthworm    : null,
            'CrystalSlime':        typeof CrystalSlime        !== 'undefined' ? CrystalSlime        : null,
            'HardrockBeetle':      typeof HardrockBeetle      !== 'undefined' ? HardrockBeetle      : null,
            'MimicOre':            typeof MimicOre            !== 'undefined' ? MimicOre            : null,
            'VolatileCrystal':     typeof VolatileCrystal     !== 'undefined' ? VolatileCrystal     : null,
        };
        const cls = classMap[className];
        if (!cls) { console.warn('[Creative] missing class', className); return; }
        const grp = scene[groupName];
        if (!grp) { console.warn('[Creative] missing group', groupName); return; }
        const m = new cls(scene, cx, cy);
        grp.add(m);
        // creative 模式：完全冻结怪物
        m._creativeFrozen = true;
        if (m.body) {
            m.body.setVelocity(0, 0);
            m.body.setAllowGravity(false);
            m.body.setImmovable(true);
        }
        m.update = function() {};
        if (m.setVisible) m.setVisible(true);
        if (m.setActive) m.setActive(true);
        if (m.setDepth) m.setDepth(10);
        if (m.setFrame) { try { m.setFrame(0); } catch(e) {} }
        if (scene.uiCam) {
            try { scene.uiCam.ignore(m); } catch(e) {}
        }
    }

    /**
     * 放门 + 自动合并相邻同类型门
     *
     * 逻辑：
     *   1. 当前格 (col, row) 检测 4 邻居有没有同类型门
     *   2. 收集所有连通的同类型门 → 删除它们
     *   3. 计算包围盒 → 创建一个大门覆盖整个连通区
     */
    _placeOrMergeDoor(type, cx, cy) {
        const col = Math.floor(cx / 32);
        const row = Math.floor(cy / 32);

        // 1. 找所有连通的同类型门（4 邻居 BFS）
        const visitedDoors = new Set();
        const cellsToCover = new Set();
        cellsToCover.add(col + ',' + row);

        const findAdjacentDoor = (c, r) => {
            return this._placedDoors.find(d => {
                if (d.type !== type || visitedDoors.has(d)) return false;
                return c >= d.c1 && c <= d.c2 && r >= d.r1 && r <= d.r2;
            });
        };

        const queue = [[col, row]];
        while (queue.length > 0) {
            const [cc, cr] = queue.shift();
            // 检查 4 邻居
            const NEIGHBORS = [[cc+1, cr], [cc-1, cr], [cc, cr+1], [cc, cr-1]];
            for (const [nc, nr] of NEIGHBORS) {
                const door = findAdjacentDoor(nc, nr);
                if (door) {
                    visitedDoors.add(door);
                    // 把这个门覆盖的所有格子加入
                    for (let r = door.r1; r <= door.r2; r++) {
                        for (let c = door.c1; c <= door.c2; c++) {
                            const k = c + ',' + r;
                            if (!cellsToCover.has(k)) {
                                cellsToCover.add(k);
                                queue.push([c, r]);
                            }
                        }
                    }
                }
            }
        }

        // 2. 删除所有连通的旧门
        visitedDoors.forEach(d => {
            if (d.obj) {
                if (d.obj.rect) d.obj.rect.destroy();
                if (d.obj.label) d.obj.label.destroy();
                if (d.obj.cracks) d.obj.cracks.destroy();
            }
        });
        this._placedDoors = this._placedDoors.filter(d => !visitedDoors.has(d));

        // 3. 计算包围盒
        let c1 = Infinity, r1 = Infinity, c2 = -Infinity, r2 = -Infinity;
        cellsToCover.forEach(k => {
            const [c, r] = k.split(',').map(Number);
            c1 = Math.min(c1, c); c2 = Math.max(c2, c);
            r1 = Math.min(r1, r); r2 = Math.max(r2, r);
        });

        // 4. 把所有覆盖的格子在 grid 里 unmark（避免旧 mark 残留）
        const scene = this.scene;
        if (scene.gridSystem) {
            for (let r = r1; r <= r2; r++) {
                for (let c = c1; c <= c2; c++) {
                    scene.gridSystem.markRect(c * 32 + 16, r * 32 + 16, 32, 32, GridSystem.AIR);
                }
            }
        }
        // 同步 wallRects（只移除被覆盖的）
        if (scene.wallRects) {
            scene.wallRects = scene.wallRects.filter(r => {
                const rxc = r.x + r.width / 2;
                const ryc = r.y + r.height / 2;
                const rcc = Math.floor(rxc / 32);
                const rcr = Math.floor(ryc / 32);
                return !(rcc >= c1 && rcc <= c2 && rcr >= r1 && rcr <= r2);
            });
        }

        // 5. 创建大门（中心在包围盒中心）
        const w = (c2 - c1 + 1) * 32;
        const h = (r2 - r1 + 1) * 32;
        const ccx = (c1 + c2 + 1) / 2 * 32;
        const ccy = (r1 + r2 + 1) / 2 * 32;

        let doorObj = null;
        switch (type) {
            case 'stone_door':
                if (typeof StoneDoor !== 'undefined') doorObj = new StoneDoor(scene, ccx, ccy, w, h, 6);
                break;
            case 'crystal_door':
                if (typeof CrystalDoor !== 'undefined') doorObj = new CrystalDoor(scene, ccx, ccy, w, h);
                break;
            case 'key_door':
                if (typeof KeyDoor !== 'undefined') doorObj = new KeyDoor(scene, ccx, ccy, w, h);
                break;
        }

        if (doorObj) {
            this._placedDoors.push({ type, c1, r1, c2, r2, obj: doorObj });
            // 让 uiCam ignore door 视觉
            if (scene.uiCam) {
                try {
                    if (doorObj.rect) scene.uiCam.ignore(doorObj.rect);
                    if (doorObj.label) scene.uiCam.ignore(doorObj.label);
                    if (doorObj.cracks) scene.uiCam.ignore(doorObj.cracks);
                } catch(e) {}
            }
        }
    }

    /** 重画 Cavetile 皮肤
     * @param {object} [area]  {col, row} — 只刷新围绕这个格子 ±8 格的范围（性能优化）
     */
    _refreshSkin(area) {
        const scene = this.scene;
        if (!scene._cavetileSkinImgs) scene._cavetileSkinImgs = [];

        if (area && typeof area.col === 'number' && typeof area.row === 'number') {
            // 局部刷新（±8 格）
            const RADIUS = 2;
            const range = {
                col1: area.col - RADIUS,
                row1: area.row - RADIUS,
                col2: area.col + RADIUS,
                row2: area.row + RADIUS
            };
            if (typeof CavetileWall !== 'undefined' && CavetileWall.renderSkins) {
                CavetileWall.renderSkins(scene, range);
                // 加进 _cavetileSkinImgs（仅追加新创建的）
                scene.children.list.forEach(c => {
                    if (c && c.depth === -5 && c.texture && c.texture.key && c.texture.key.startsWith('Cavetile_')) {
                        if (!scene._cavetileSkinImgs.includes(c)) {
                            scene._cavetileSkinImgs.push(c);
                        }
                    }
                });
            }
        } else {
            // 全局刷新（首次或 fallback）
            scene._cavetileSkinImgs.forEach(img => img.destroy());
            scene._cavetileSkinImgs = [];
            scene.children.list.slice().forEach(c => {
                if (c && c.depth === -5 && c.texture && c.texture.key && c.texture.key.startsWith('Cavetile_')) {
                    c.destroy();
                }
            });
            if (typeof CavetileWall !== 'undefined' && CavetileWall.renderSkins) {
                CavetileWall.renderSkins(scene);
                scene.children.list.forEach(c => {
                    if (c && c.depth === -5 && c.texture && c.texture.key && c.texture.key.startsWith('Cavetile_')) {
                        scene._cavetileSkinImgs.push(c);
                    }
                });
            }
        }

        this._sweepUICamIgnore();
    }

    /** 通用扫描：让 uiCam 忽略所有世界对象（创造模式新增的） */
    _sweepUICamIgnore() {
        const scene = this.scene;
        if (!scene.uiCam) return;

        const safeIgnore = (obj) => {
            if (!obj) return;
            try { scene.uiCam.ignore(obj); } catch(e) {}
        };

        // 1. CavetileWall 皮肤
        if (scene._cavetileSkinImgs) scene._cavetileSkinImgs.forEach(safeIgnore);

        // 2. BackgroundBlock
        if (scene._backgroundBlocks) {
            scene._backgroundBlocks.forEach(bg => safeIgnore(bg.image));
        }

        // 3. SecretDoor
        if (scene._secretDoors) {
            scene._secretDoors.forEach(d => {
                safeIgnore(d.image);
                safeIgnore(d.eIcon);
            });
        }

        // 4. CrystalBlock
        if (scene._crystalOres) {
            scene._crystalOres.forEach(ore => safeIgnore(ore.sprite));
        }

        // 5. 已 placedDoors（创造模式放的 stone/crystal/key door）
        if (this._placedDoors) {
            this._placedDoors.forEach(d => {
                if (!d.obj) return;
                safeIgnore(d.obj.rect);
                safeIgnore(d.obj.label);
                safeIgnore(d.obj.cracks);
            });
        }

        // 6. 怪物组
        ['spiders', 'bungeeSpiders', 'bats', 'earthworms', 'slimes',
         'beetles', 'volatileCrystals', 'mimicOres'].forEach(name => {
            const grp = scene[name];
            if (!grp || !grp.getChildren) return;
            grp.getChildren().forEach(safeIgnore);
        });

        // 7. walls staticGroup（创造模式放的墙）
        if (scene.walls && scene.walls.getChildren) {
            scene.walls.getChildren().forEach(safeIgnore);
        }
    }

    _export() {
        const data = {
            version: '0.2',
            history: this.globalHistory
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'level_' + Date.now() + '.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    _import() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    this._applyImported(data);
                } catch (err) {
                    alert('Invalid JSON: ' + err.message);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    _applyImported(data) {
        if (!data.history) return;
        // 重放历史
        for (const a of data.history) {
            const cx = a.col * 32 + 16;
            const cy = a.row * 32 + 16;
            this._removeCellObjects(a.col, a.row);
            this._createCellByType(cx, cy, a.newType);
            const key = a.col + ',' + a.row;
            if (!this.cellHistory.has(key)) this.cellHistory.set(key, []);
            this.cellHistory.get(key).push(a.newType);
        }
        this.globalHistory = data.history.slice();
        this.redoStack = [];
        this._refreshSkin();
    }

    getAllUIObjects() {
        return this.panel ? [this.panel] : [];
    }
}