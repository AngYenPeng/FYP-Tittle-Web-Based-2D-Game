/**
 * SafeZone25Scene — 空白沙盒地图
 * 继承 SafeZone3Scene 的全部功能 (稿子/战斗/怪物/门/HUD/宝箱/骷髅 hint 等),
 * 但没有地形、没有剧情、没有 NPC。出生点下方一块 5 格宽平台供玩家站立。
 * 地图尺寸 (相对可见区 1280×720): 上+10 下+10 左+100 右+10 格。
 */
class SafeZone25Scene extends SafeZone3Scene {

    constructor() {
        super();
        Phaser.Scene.call(this, { key: 'SafeZone25Scene' });
    }

    init(data) {
        this._inheritedData = data || {};
    }

    create() {
        if (typeof AudioSystem !== 'undefined') AudioSystem.bgm(this, 'bgm_SafeZone25');  // BGM (SafeZone25.mp3 放进 BGM/ 即生效)
        // (用户修复) 不再进场强制解锁 — 从 registry 读; SZ3 升级镐 NPC 才是合法解锁点 (原捷径导致免对话解锁)
        this._pickaxeUpgraded = !!this.registry.get('pickaxeUpgraded');
        this.WARNING_DISTANCE = 280; this.HEAVY_FLY_LIMIT = 214; this.CRITICAL_DISTANCE = 380;
        this.activeEnd1 = 14; this.activeEnd2 = 14;
        this._cinematicLock = false;

        this._registerMonsterAnims();

        const G = 32;
        const W = 1280;
        const H = 720;
        this.physics.world.setBounds(0, 0, W, H);

        // 背景
        if (this.textures.exists('Tutorial_scene_background_image')) {
            this.bg = this.add.image(W / 2, H / 2, 'Tutorial_scene_background_image');
            const bgScale = Math.max(W / this.bg.width, H / this.bg.height);
            this.bg.setScale(bgScale).setScrollFactor(0).setDepth(-100);
        }

        this._initT1State();
        this.input.mouse.disableContextMenu();
        this._registerAnims();

        // 按键
        this.keyJump   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.keyCrouch = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        this.keyF      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
        this.keyE      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.keyShift  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        this.keyR      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
        this.keyESC    = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
        this.keyZ      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
        this.keyX      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
        this.keyC      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
        this.keyB      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);
        this.input.keyboard.addCapture([
            Phaser.Input.Keyboard.KeyCodes.SHIFT, Phaser.Input.Keyboard.KeyCodes.SPACE,
            Phaser.Input.Keyboard.KeyCodes.F, Phaser.Input.Keyboard.KeyCodes.E,
            Phaser.Input.Keyboard.KeyCodes.S, Phaser.Input.Keyboard.KeyCodes.R,
            Phaser.Input.Keyboard.KeyCodes.Z, Phaser.Input.Keyboard.KeyCodes.X,
            Phaser.Input.Keyboard.KeyCodes.C, Phaser.Input.Keyboard.KeyCodes.B,
        ]);

        // 地图尺寸: 上+10 下+10 左+100 右+10 格
        const BUF_T = 10, BUF_B = 10, BUF_L = 100, BUF_R = 12;  // BUF_R 12: 让 col 50 封边墙进界
        const totalW = W + (BUF_L + BUF_R) * G;
        const totalH = H + (BUF_T + BUF_B) * G;
        const originX = -BUF_L * G;
        const originY = -BUF_T * G;
        this.gridSystem = new GridSystem(this, G, totalW, totalH, originX, originY);

        // 物理组
        this.walls = this.physics.add.staticGroup();
        this.platforms = this.physics.add.staticGroup();
        this.bgBlocks = this.physics.add.staticGroup();
        this.crystalBlocks = this.physics.add.staticGroup();
        this.wallRects = [];
        this.droppedCrystals = this.physics.add.group();
        this.droppedYellowCrystals = this.physics.add.group();
        this.spiders = this.physics.add.group();
        this.bungeeSpiders = this.physics.add.group();
        this.bats = this.physics.add.group();
        this.earthworms = this.physics.add.group();
        this.slimes = this.physics.add.group();
        this.beetles = this.physics.add.group();
        this.mimicOres = this.physics.add.group();
        this.volatileCrystals = this.physics.add.group();

        // 出生点 + 5 格宽平台 (出生点正下方)
        const spawnCol = 49, spawnRow = 5;
        const spawnX = spawnCol * G + G / 2;
        const spawnY = spawnRow * G + G / 2;
        this.spawnX = spawnX;
        this.spawnY = spawnY;

        // === 地形 helpers (dedup + air 挖空) ===
        const _wallCells = new Set();
        const cavetileAt = (c, r) => {
            const k = c + ',' + r;
            if (_wallCells.has(k)) return;
            _wallCells.add(k);
            new CavetileWall(this, c * G + G / 2, r * G + G / 2, G, G);
        };
        const cavetileRange = (c1, r1, c2, r2) => {
            for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++)
                for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++)
                    cavetileAt(c, r);
        };
        const airRange = (c1, r1, c2, r2) => {
            const lo_c = Math.min(c1, c2), hi_c = Math.max(c1, c2);
            const lo_r = Math.min(r1, r2), hi_r = Math.max(r1, r2);
            for (let c = lo_c; c <= hi_c; c++)
                for (let r = lo_r; r <= hi_r; r++) {
                    _wallCells.delete(c + ',' + r);
                    if (this.gridSystem) this.gridSystem.markRect(c * G + G/2, r * G + G/2, G, G, GridSystem.AIR);
                }
            if (this.walls && this.walls.getChildren) {
                this.walls.getChildren().slice().forEach(w => {
                    const wc = Math.floor(w.x / G), wr = Math.floor(w.y / G);
                    if (wc >= lo_c && wc <= hi_c && wr >= lo_r && wr <= hi_r) w.destroy();
                });
            }
            if (this.wallRects) {
                this.wallRects = this.wallRects.filter(rect => {
                    const wc = Math.floor((rect.x + rect.width/2)/G), wr = Math.floor((rect.y + rect.height/2)/G);
                    return !(wc >= lo_c && wc <= hi_c && wr >= lo_r && wr <= hi_r);
                });
            }
        };

        // === JSON level_1780320716242 地形 ===
        // 墙 (cavetile, 带皮肤) — 区2 结构 + 底部块
        const _sz25Walls = [
            [-72,-4,-56,-4],
            [-72,-3,-56,-3],
            [-72,-2,-56,-2],
            [-72,-1,-56,-1],
            [-72,0,-56,0],
            [-72,1,-56,1],
            [-72,2,-56,2],
            [-72,3,-54,3],
            [-72,4,-59,4],
            [-72,5,-60,5],
            [-72,6,-61,6],
            [-72,7,-61,7],
            [-72,8,-61,8],
            [-72,9,-61,9],
            [-72,10,-61,10],
            [-72,11,-61,11],
            [-72,12,-61,12],
            [-72,13,-61,13],
            [-72,14,-61,14],
            [-55,14,-42,14],
            [-72,15,-61,15],
            [-55,15,-42,15],
            [-72,16,-61,16],
            [-55,16,-42,16],
            [-72,17,-61,17],
            [-55,17,-42,17],
            [-72,18,-61,18],
            [-55,18,-42,18],
            [-72,19,-61,19],
            [-55,19,-42,19],
            [-72,20,-61,20],
            [-55,20,-42,20],
            [-72,21,-61,21],
            [-55,21,-42,21],
            [-72,22,-61,22],
            [-55,22,-42,22],
            [-72,23,-61,23],
            [-55,23,-42,23],
            [-72,24,-61,24],
            [-55,24,-42,24]
        ];
        // air (挖空走廊)
        const _sz25Air = [
            [-68,-5,-68,-5],
            [-21,0,-21,0],
            [-19,0,-17,0],
            [2,0,3,0],
            [5,0,7,0],
            [17,0,18,0],
            [28,0,30,0],
            [-43,1,-42,1],
            [-40,1,-39,1],
            [-35,1,-35,1],
            [-22,1,-16,1],
            [-13,1,-10,1],
            [0,1,8,1],
            [15,1,20,1],
            [28,1,32,1],
            [41,1,41,1],
            [43,1,44,1],
            [-51,2,-49,2],
            [-45,2,-31,2],
            [-26,2,-16,2],
            [-14,2,-9,2],
            [-7,2,-6,2],
            [0,2,8,2],
            [10,2,20,2],
            [26,2,33,2],
            [35,2,35,2],
            [40,2,45,2],
            [-53,3,-53,3]
        ];
        // 蓝水晶 (airRange + CrystalBlock)
        const _sz25Crystals = [[-52, 2], [-50, 6], [-46, 3], [-42, 6], [-41, 1], [-36, 1], [-32, 6], [-30, 2], [-23, 1], [-20, 0], [-20, 6], [-18, 6], [-15, 2], [-12, 6], [-8, 2], [-3, 6], [-1, 2], [4, 0], [5, 6], [9, 2], [13, 6], [14, 1], [19, 6], [21, 2], [23, 3], [27, 1], [29, 6], [34, 2], [37, 6], [42, 1]];

        // 走廊地板/天花板 (cavetile 带, JSON 没盖这部分)
        cavetileRange(-55, -4, 49, 2);   // 天花板
        cavetileRange(-55, 7, 49, 13);   // 地板
        // 右侧封边 (col 50): 天花板段 rows -3~2 + 地板段 rows 7~13 (中间 rows 3~6 是走廊开口)
        cavetileRange(50, -3, 50, 2);
        cavetileRange(50, 7, 50, 13);
        // JSON 墙 (区2 结构 + 底部块)
        _sz25Walls.forEach(([c1, r1, c2, r2]) => cavetileRange(c1, r1, c2, r2));
        // JSON air (挖空走廊)
        _sz25Air.forEach(([c1, r1, c2, r2]) => airRange(c1, r1, c2, r2));
        // 蓝水晶 (airRange + CrystalBlock)
        if (typeof CrystalBlock !== 'undefined') {
            if (!this._crystalOres) this._crystalOres = [];
            _sz25Crystals.forEach(([c, r]) => {
                airRange(c, r, c, r);
                const ore = new CrystalBlock(this, c * G + G/2, r * G + G/2, { hp: 10, dropCount: 1 });
                this._crystalOres.push(ore);
                if (this.uiCam && ore.sprite) { try { this.uiCam.ignore(ore.sprite); } catch(e) {} }
            });
        }
        // (石门已移除) 保留 (-55,4-6) 为开口 — 区1 → 区2 通道
        airRange(-55, 4, -55, 6);

        // 物理边界
        this.physics.world.setBounds(originX, originY, totalW, totalH);

        // 渲染 cavetile 皮肤 (cave 边缘/角/中心贴图)
        if (typeof CavetileWall !== 'undefined' && CavetileWall.renderSkins) {
            CavetileWall.renderSkins(this);
        }

        // 网格线 (R 切换)
        this._gridGraphics = this.add.graphics().setDepth(0);
        this._gridGraphics.lineStyle(1, 0xffffff, 0.15);
        for (let x = 0; x <= W; x += G) { this._gridGraphics.moveTo(x, 0); this._gridGraphics.lineTo(x, H); }
        for (let y = 0; y <= H; y += G) { this._gridGraphics.moveTo(0, y); this._gridGraphics.lineTo(W, y); }
        this._gridGraphics.strokePath();
        this._gridGraphics.setVisible(false);

        // 物理子系统
        this.ropePhysics    = new RopePhysics(this);
        this.dashSystem     = new DashSystem(this);
        this.movementSystem = new MovementSystem(this);
        this.throwSystem    = new ThrowSystem(this);
        this.grappleSystem  = new GrappleSystem(this);
        this.recallSystem   = new RecallSystem(this);
        this.meleeSystem    = new MeleeSystem(this);

        // 玩家
        this.player = new Player(this, spawnX, spawnY);
        this.physics.add.collider(this.player, this.walls);
        // 玩家空气墙 (col 50, rows 3-6): 透明, 只挡玩家 (封住走廊右侧开口)
        {
            const pwX = 50 * G + G / 2;
            const pwTop = 3, pwBot = 6;
            const pwY = (pwTop + pwBot + 1) / 2 * G;   // rows 3-6 中心
            const pwH = (pwBot - pwTop + 1) * G;        // 4 格高
            const pwRect = this.add.rectangle(pwX, pwY, G, pwH, 0, 0);  // alpha 0 透明
            this.physics.add.existing(pwRect, true);    // static body
            if (!this.playerWalls || !this.playerWalls.children) this.playerWalls = this.physics.add.staticGroup();   // (用户) 死组检测 — 同 MobWall 重启崩溃修复
            this.playerWalls.add(pwRect);
            this.physics.add.collider(this.player, this.playerWalls);
            this._registerPickBlocker(pwRect);   // (用户) 挡玩家空气墙也挡稿子 (碰撞器在 _setupRealPickaxes 补挂)
            if (this.uiCam) { try { this.uiCam.ignore(pwRect); } catch (e) {} }
        }
        this.physics.add.collider(this.droppedCrystals, this.walls);
        this.physics.add.collider(this.droppedYellowCrystals, this.walls);
        ['spiders','bats','slimes','beetles','earthworms','mimicOres','bungeeSpiders','volatileCrystals'].forEach(g => {
            if (this[g]) this.physics.add.collider(this[g], this.walls);
        });

        // 真稿子系统 (继承自 GameScene/SZ3)
        this._setupRealPickaxes();
        this._registerPickMonsterHits();

        // 玩家伤害检测
        const dmgCheck = (p, m) => {
            if (m.canDamagePlayer && m.canDamagePlayer()) {
                if (this._playerHit) this._playerHit(p, m);
                if (m.onHitPlayer) m.onHitPlayer();
            }
        };
        ['spiders','bats','slimes','beetles','earthworms','mimicOres','bungeeSpiders','volatileCrystals'].forEach(g => {
            if (this[g]) this.physics.add.overlap(this.player, this[g], dmgCheck);
        });

        // UI 系统
        this.healthSystem    = new HealthSystem(this);    this.healthSystem.init();
        // SZ25 自定义死亡: 黑屏 + 爱心 -1 + 复活 (不回大厅/不去存档点), 覆盖默认 _loseHeart
        this.healthSystem._loseHeart = () => this._sz25HandleDeath();
        this.diseaseSystem   = new DiseaseSystem(this);   this.diseaseSystem.init();
        this.inventorySystem = new BackpackSystem(this);  this.inventorySystem.init();
        this.backpackSystem  = this.inventorySystem;
        this.hudSystem       = new HUDSystem(this);       this.hudSystem.init();
        this.settingsSystem  = new SettingsSystem(this);  this.settingsSystem.init();
        if (typeof CreativeSystem !== 'undefined') { this.creativeSystem = new CreativeSystem(this); this.creativeSystem.init(); }
        this.dialogSystem    = new DialogSystem(this);    this.dialogSystem.init();
        if (typeof QuestSystem !== 'undefined') { this.questSystem = new QuestSystem(this); this.questSystem.init(); }
        this.guideSystem     = new GuideSystem(this);     this.guideSystem.init();
        if (typeof ShopSystem !== 'undefined') { this.shopSystem = new ShopSystem(this); this.shopSystem.init(); }
        this.interactSystem  = new InteractSystem(this);  this.interactSystem.init();

        // 怪物掉落监听 (crystal)
        this.events.on('monster_killed', (mx, my, dropRate) => {
            if (Math.random() <= dropRate) {
                const angle = Math.random() * Math.PI * 2;
                const radius = 5 + Math.random() * 10;
                let targetX = mx + Math.cos(angle) * radius;
                let targetY = my + Math.sin(angle) * radius;
                if (this.wallRects) {
                    for (const w of this.wallRects) {
                        if (targetX >= w.left && targetX <= w.right && targetY >= w.top && targetY <= w.bottom) { targetY = w.top - 1; break; }
                    }
                }
                const tex = this.textures.exists('Crystal') ? 'Crystal' : 'drop_crystal_img';
                const c = this.add.image(mx, my, tex);
                if (tex === 'Crystal') c.setDisplaySize(20, 20);
                c.setDepth(8);
                if (this.uiCam) this.uiCam.ignore(c);
                c._isDroppedCrystal = true;
                c._pickupReadyAt = this.time.now + 500;
                c.active = true;
                this.droppedCrystals.add(c);
                this.tweens.add({ targets: c, x: targetX, duration: 350, ease: 'Linear' });
                this.tweens.add({ targets: c, angle: 360, duration: 350, ease: 'Linear' });
                const peakY = Math.min(my, targetY) - 30;
                this.tweens.add({ targets: c, y: peakY, duration: 175, ease: 'Quad.easeOut',
                    onComplete: () => this.tweens.add({ targets: c, y: targetY, duration: 175, ease: 'Quad.easeIn', onComplete: () => { c.angle = 0; } }) });
            }
        });

        // slime 分裂
        this.events.on('slime_split', (x, y) => {
            for (let i = 0; i < 2; i++) {
                const mini = new CrystalSlime(this, x + (i === 0 ? -20 : 20), y - 10, true);
                this.slimes.add(mini);
                if (mini.setDepth) mini.setDepth(10);
                if (this.uiCam) { try { this.uiCam.ignore(mini); } catch(e) {} }
                this.physics.add.collider(mini, this.walls);
            }
        });

        // 镜头 chunk: 区1+区2 合并成一个 (整个区域, 镜头平滑跟随玩家, 不切换)
        //   范围 = 走廊 + 竖井的并集: cols -71~49, rows -4~18
        this._chunks = [
            { id: 'zone', x1: -71, y1: -4, x2: 49, y2: 18 }
        ];
        this._currentChunkId = null;

        // Mob 透明墙 (沿全图边界)
        const barrierTh = 4;
        for (const ch of this._chunks) {
            const bx1 = ch.x1 * G, bx2 = (ch.x2 + 1) * G;
            const by1 = ch.y1 * G, by2 = (ch.y2 + 1) * G;
            const w = bx2 - bx1, h = by2 - by1;
            new MobWall(this, bx1 + w/2, by1 - barrierTh/2, w, barrierTh);
            new MobWall(this, bx1 + w/2, by2 + barrierTh/2, w, barrierTh);
            new MobWall(this, bx1 - barrierTh/2, by1 + h/2, barrierTh, h);
            new MobWall(this, bx2 + barrierTh/2, by1 + h/2, barrierTh, h);
        }
        if (this.mobWalls) {
            ['spiders','bats','slimes','beetles','earthworms','bungeeSpiders','mimicOres','volatileCrystals'].forEach(g => {
                if (this[g]) this.physics.add.collider(this[g], this.mobWalls);
            });
        }

        this.cameras.main.setZoom(2);  // 参考 SZ2 大小
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this._updateChunkCamera();

        // 鼠标
        const cursorTex = this.textures.exists('Mouse_cursor') ? 'Mouse_cursor' : 'crosshair_custom';
        this.crosshair = this.add.sprite(0, 0, cursorTex).setDepth(999999).setScrollFactor(0);
        { const _p0 = this.input && this.input.activePointer; if (_p0) this.crosshair.setPosition(_p0.x, _p0.y); }   // (用户修复) 创建即归位 — 防地图刚显示时光标在 (0,0) 闪没一瞬
        if (cursorTex !== 'Mouse_cursor') this.crosshair.setTint(0xffff00);
        this.leftHandIndicator  = this.add.sprite(0, 0, 'left_hand_icon').setDepth(999998).setVisible(false).setScrollFactor(0);
        this.rightHandIndicator = this.add.sprite(0, 0, 'right_hand_icon').setDepth(999998).setVisible(false).setScrollFactor(0);
        this.input.on('pointermove', (pointer) => {
            if (!this.crosshair) return;
            this.crosshair.setPosition(pointer.x, pointer.y);
            this.leftHandIndicator.setPosition(pointer.x - 22, pointer.y);
            this.rightHandIndicator.setPosition(pointer.x + 22, pointer.y);
        });
        this.game.canvas.style.cursor = 'none';

        // pointerdown — 跟 SZ3 同套 (丢/grapple/melee)
        this.input.on('pointerdown', (pointer) => {
            if (!this.player.body || this.isPlayerStunned || this.isDead) return;
            if (this._cinematicLock) return;
            if (this.shopSystem?.isOpen || this.hudSystem?.gamePausedByConfirm) return;
            if (this.backpackSystem?.isOpen || this.settingsSystem?.isOpen || this.creativeSystem?.isOpen) return;
            if (this.dialogSystem?.isOpen || this.guideSystem?.isOpen) return;
            if (this._suppressNextClick) { this._suppressNextClick = false; return; }
            if (this._isClickOnHUDButton && this._isClickOnHUDButton(pointer)) return;

            let item = this.inventorySystem?.getActiveItem?.();
            let holdingPickaxe = item && item.type === 'pickaxe';
            let side = this.player.pState?.activeHand;
            let pick = side === 'left' ? this.pick1 : this.pick2;

            if (pointer.button === 2) {
                if (holdingPickaxe && this._pickaxeUpgraded) {
                    pick.state === 'idle' ? this.throwSystem.releaseThrow(pointer) : this.recallSystem.startRecall(pick);
                }
            } else if (pointer.button === 0) {
                if (holdingPickaxe && pick.state === 'attached' && this._pickaxeUpgraded) {
                    this.grappleSystem.startZip(pick);
                } else {
                    if (this.meleeSystem.execute()) this._checkMeleeOnCrystalOres();
                }
            }
        });

        // UI Camera
        this.cameraSystem = new CameraSystem(this.cameras.main, this.player);
        this.uiCam = this.cameraSystem.setupUICamera(this);
        try {
            this.cameras.main.ignore(this.crosshair);
            this.cameras.main.ignore(this.leftHandIndicator);
            this.cameras.main.ignore(this.rightHandIndicator);
        } catch(e) {}

        // 继承上一场景状态
        this._applyInheritedState();
        if (typeof SaveSystem !== 'undefined') SaveSystem.autoSave(this);   // 进入区域自动存档

        // console.log('[SZ2.5] Sandbox ready. Spawn (' + spawnCol + ',' + spawnRow + '), 2 cavetile bands (ceiling -4~2, floor 7~13).');   // (用户) 诊断日志静默
    }

    // 干净 update — 只保留沙盒需要的循环 (无剧情/无 SZ4 传送/无特殊 NPC)
    /** SZ25 死亡: 画面渐黑 + 停震动 + 黑屏显示爱心 → 最右爱心 -1 → 复活 */
    _sz25HandleDeath() {
        if (this._sz25DeathSeq) return;
        this._sz25DeathSeq = true;
        const hs = this.healthSystem;
        const preHearts = Math.max(0, hs.hearts);   // 死前爱心数 (显示这么多颗)

        // 冻结玩家 + 无敌 + 停震动
        hs.isDead = true; this.isDead = true;
        this.isPlayerStunned = true; this.isPlayerInvincible = true;
        if (this.cameras.main.shakeEffect && this.cameras.main.shakeEffect.reset) {
            this.cameras.main.shakeEffect.reset();
        }
        if (this.player && this.player.body) {
            this.player.body.setVelocity(0, 0);
            this.player.body.setAllowGravity(false);
            this.player.body.setImmovable(true);
        }
        if (hs.deathPanel) hs.deathPanel.setVisible(false);   // 隐藏默认死亡面板
        hs.deathCountdown = 0;

        // 黑色覆盖层 (只让 uiCam 渲染, zoom 1 全屏)
        const cw = this.cameras.main.width, ch = this.cameras.main.height;
        const black = this.add.rectangle(cw / 2, ch / 2, cw, ch, 0x000000, 0)
            .setScrollFactor(0).setDepth(99999);
        try { this.cameras.main.ignore(black); } catch (e) {}
        this._sz25DeathBlack = black;
        this.tweens.add({
            targets: black, alpha: 1, duration: 600, ease: 'Quad.easeIn',
            onComplete: () => this._sz25ShowHeartLoss(preHearts)
        });
    }

    /** 黑屏里显示 n 颗独立爱心, 最右边那颗 -1 (淡出缩小) → 复活 */
    _sz25ShowHeartLoss(n) {
        const cw = this.cameras.main.width, ch = this.cameras.main.height;
        const spacing = 64;
        const startX = cw / 2 - (n - 1) * spacing / 2;
        const arr = [];
        for (let i = 0; i < n; i++) {
            const h = this.add.text(startX + i * spacing, ch / 2, '\u2764', {
                fontSize: '52px', color: '#ff3355', fontFamily: '"VT323", monospace'
            }).setOrigin(0.5).setScrollFactor(0).setDepth(100000);
            try { this.cameras.main.ignore(h); } catch (e) {}
            arr.push(h);
        }
        this._sz25DeathHearts = arr;
        if (n <= 0) { this.time.delayedCall(700, () => this._sz25Respawn()); return; }
        // 最右边那颗 → 碎掉 (抖动 → 碎裂飞溅), 碎完游戏解锁/复活
        this.time.delayedCall(450, () => {
            this._sz25ShatterHeart(arr[n - 1], () => {
                this.time.delayedCall(300, () => this._sz25Respawn());
            });
        });
    }

    /** 一颗爱心碎掉: 抖动 + 变灰 → 缩放旋转淡出 + 飞溅 6 块碎片 */
    _sz25ShatterHeart(heart, onDone) {
        if (!heart || !heart.active) { if (onDone) onDone(); return; }
        const hx = heart.x, hy = heart.y;
        if (heart.setColor) heart.setColor('#999999');   // 变灰 (将碎)
        // 1) 抖动
        this.tweens.add({
            targets: heart, x: hx + 3, duration: 38, yoyo: true, repeat: 5, ease: 'Sine.easeInOut',
            onComplete: () => {
                if (heart.setColor) heart.setColor('#ff3355');
                // 2) 本体碎裂 (缩小旋转淡出)
                this.tweens.add({ targets: heart, scaleX: 0.1, scaleY: 0.1, angle: 130, alpha: 0, duration: 260, ease: 'Quad.easeIn' });
                // 3) 飞溅碎片
                for (let i = 0; i < 6; i++) {
                    const f = this.add.text(hx, hy, '\u2764', {
                        fontSize: '20px', color: '#ff3355', fontFamily: '"VT323", monospace'
                    }).setOrigin(0.5).setScrollFactor(0).setDepth(100001);
                    try { this.cameras.main.ignore(f); } catch (e) {}
                    const ang = (Math.PI * 2 / 6) * i + Math.random() * 0.6;
                    const dist = 40 + Math.random() * 30;
                    this.tweens.add({
                        targets: f,
                        x: hx + Math.cos(ang) * dist,
                        y: hy + Math.sin(ang) * dist + 30,
                        angle: Math.random() * 360, alpha: 0, scaleX: 0.3, scaleY: 0.3,
                        duration: 460, ease: 'Quad.easeOut',
                        onComplete: () => { if (f && f.destroy) f.destroy(); }
                    });
                }
                this.time.delayedCall(480, () => { if (onDone) onDone(); });
            }
        });
    }

    /** 复活到出生点: 扣 1 爱心 + 回满 HP + 清空怪物 + 刷新震动机制 + 黑屏淡出 */
    _sz25Respawn() {
        const hs = this.healthSystem;
        hs.hearts = Math.max(0, hs.hearts - 1);   // 扣 1 爱心
        hs.hp = hs.maxHp; hs.playerHp = hs.hp;     // 回满 HP
        if (hs.updateUI) hs.updateUI();
        // 清除所有 debuff (中毒 DoT / 减速 / 侵蚀度) — 复活后不该残留
        if (this.diseaseSystem && this.diseaseSystem.reset) this.diseaseSystem.reset();

        // 复活到出生点
        if (this.player) {
            this.player.setPosition(this.spawnX, this.spawnY);
            this.player.clearTint(); this.player.setAlpha(1);
            if (this.player.body) {
                this.player.body.setVelocity(0, 0);
                this.player.body.setAllowGravity(true);
                this.player.body.setImmovable(false);
            }
        }
        // 清空所有怪物
        ['spiders', 'bats', 'slimes', 'beetles', 'earthworms', 'bungeeSpiders', 'mimicOres', 'volatileCrystals'].forEach(g => {
            if (this[g] && this[g].clear) this[g].clear(true, true);
        });
        // 刷新触发震动的机制
        this._sz25ShakeStarted = false;
        this._sz25Transitioning = false;
        this._sz25SpawnAcc = 0;
        if (this.cameras.main.shakeEffect && this.cameras.main.shakeEffect.reset) this.cameras.main.shakeEffect.reset();
        // 镜头回 zone1
        this._currentChunkId = null;
        if (this._updateChunkCamera) this._updateChunkCamera();
        // 清死亡状态
        hs.isDead = false; this.isDead = false;
        this.isPlayerStunned = false; this.isPlayerInvincible = false;
        // 移除爱心 + 黑屏淡出
        if (this._sz25DeathHearts) {
            this._sz25DeathHearts.forEach(h => { if (h && h.destroy) h.destroy(); });
            this._sz25DeathHearts = null;
        }
        if (this._sz25DeathBlack) {
            const black = this._sz25DeathBlack;
            this._sz25DeathBlack = null;
            this.tweens.add({
                targets: black, alpha: 0, duration: 600, ease: 'Quad.easeOut',
                onComplete: () => { if (black && black.destroy) black.destroy(); }
            });
        }
        this._sz25DeathSeq = false;
    }

    /** 追逐序列: 从 (49,6) 刷随机 1-3 只 mob, 强制一直追玩家, 场地上限 150 */
    _sz25SpawnMobs() {
        const G = 32;
        const allGroups = ['spiders', 'bats', 'slimes', 'beetles', 'earthworms', 'bungeeSpiders', 'mimicOres', 'volatileCrystals'];
        let total = 0;
        allGroups.forEach(g => { if (this[g] && this[g].getChildren) total += this[g].getChildren().length; });
        if (total >= 150) return;

        const sx = 49 * G + G / 2, sy = 6 * G + G / 2;
        const pool = ['spider', 'slime', 'bat', 'earthworm', 'beetle'];
        const n = Phaser.Math.Between(1, 3);
        for (let i = 0; i < n; i++) {
            if (total >= 150) break;
            const pick = Phaser.Utils.Array.GetRandom(pool);
            const ox = sx + Phaser.Math.Between(-8, 8);
            const oy = sy + Phaser.Math.Between(-8, 8);
            let mob = null, grp = null;
            switch (pick) {
                case 'spider':
                    if (typeof CrystalHunterSpider !== 'undefined') { mob = new CrystalHunterSpider(this, ox, oy); grp = this.spiders; }
                    break;
                case 'slime':
                    if (typeof CrystalSlime !== 'undefined') { mob = new CrystalSlime(this, ox, oy, false); grp = this.slimes; }
                    break;
                case 'bat':
                    if (typeof CrystalBat !== 'undefined') { mob = new CrystalBat(this, ox, oy); grp = this.bats; }
                    break;
                case 'earthworm':
                    if (typeof CrystalEarthworm !== 'undefined') { mob = new CrystalEarthworm(this, ox, oy); grp = this.earthworms; }
                    break;
                case 'beetle':
                    if (typeof HardrockBeetle !== 'undefined') { mob = new HardrockBeetle(this, ox, oy); grp = this.beetles; }
                    break;
            }
            if (!mob) continue;
            if (grp && grp.add) grp.add(mob);
            // 组 collider (create 里已建 walls/mobWalls) 自动覆盖动态子物体, 无需 per-mob collider
            if (pick === 'bat' && mob.body) { mob.body.setAllowGravity(false); mob.body.setVelocity(0, 0); }  // 蝙蝠飞行, 关重力
            mob.forceAggroTimer = 1e12;   // 强制一直警戒/追玩家 (无视距离)
            mob._sz25Horde = true;        // 标记: update 里持续重置 aggro
            if (pick === 'earthworm' && mob.state !== undefined) mob.state = 'chase';  // 蚯蚓醒来
            if (this.uiCam) { try { this.uiCam.ignore(mob); } catch (e) {} }
            total++;
        }
    }

    /** 覆盖: 追逐序列里所有怪物无视距离都 update (horde 从任意距离追玩家) */
    _updateMonstersFiltered(time, delta) {
        if (!this.player) return;
        const groups = ['spiders', 'bats', 'slimes', 'beetles', 'earthworms', 'bungeeSpiders', 'mimicOres', 'volatileCrystals'];
        for (const grpName of groups) {
            const grp = this[grpName];
            if (!grp || !grp.getChildren) continue;
            const children = grp.getChildren();
            for (let i = 0; i < children.length; i++) {
                const m = children[i];
                if (!m || !m.update) continue;
                if (m._sz25Horde) m.forceAggroTimer = 1e12;  // 持续强制警戒
                m.update(time, delta, this.player);          // 无距离过滤
            }
        }
    }

    /** SZ25 → SZ3 状态传递 (字段同 SZ2 跳转) */
    _sz25BuildTransferData() {
        return {
            crystalCount: this.hudSystem?.crystalCount,
            hp: this.healthSystem?.hp,
            maxHp: this.healthSystem?.maxHp,
            hearts: this.healthSystem?.hearts,
            hasHealthDetector: !!this._hasHealthDetector,
                yellowCrystalCount: this.hudSystem ? this.hudSystem.yellowCrystalCount : undefined,
                yellowCrystalShown: !!(this.hudSystem && this.hudSystem.yellowCrystalShown),
            corrosionPct: this.diseaseSystem?.corrosionPct,
            inventorySlots: this.inventorySystem?.slots ? [...this.inventorySystem.slots] : null
        };
    }

    update(time, delta) {
        if (this._uiPaused) return;   // (用户) 设置/guide 打开 → 全场景暂停
        if (!this.player.body) return;

        // === 追逐序列: 持续震动 + 刷怪 + 下落黑屏 → SZ3 ===
        // 1) 玩家走到 x <= 24 (col 24) → 开始震动, 一直震到进 SZ3
        if (!this._sz25ShakeStarted && !this._sz25DeathSeq && this.player.x <= 24 * 32) {
            this._sz25ShakeStarted = true;
            this.cameras.main.shake(3000, 0.003);
        }
        // 2) 震动期间: shake 结束就重触发 (保持连续) + 每 0.20s 从 (49,6) 刷怪
        if (this._sz25ShakeStarted && !this._sz25Transitioning && !this._sz25DeathSeq) {
            const fx = this.cameras.main.shakeEffect;
            if (!fx || !fx.isRunning) this.cameras.main.shake(3000, 0.003);
            this._sz25SpawnAcc = (this._sz25SpawnAcc || 0) + delta;
            if (this._sz25SpawnAcc >= 200) {  // 0.20 秒
                this._sz25SpawnAcc -= 200;
                this._sz25SpawnMobs();
            }
        }
        // 3) 玩家下降到 y >= 18 (row 18) → 逐渐黑屏 → SZ3
        if (!this._sz25Transitioning && !this._sz25DeathSeq && this.player.y >= 18 * 32) {
            this._sz25Transitioning = true;
            this.cameras.main.shake(820, 0.003);   // 黑屏期间继续震
            this.cameras.main.fadeOut(800, 0, 0, 0);
            const data = this._sz25BuildTransferData();
            this.time.delayedCall(820, () => this.scene.start('SafeZone3Scene', data));
        }

        let paused = this.shopSystem?.isOpen || this.hudSystem?.gamePausedByConfirm;

        if (this.dashCooldown > 0)  this.dashCooldown  -= delta;
        if (this.meleeCooldown > 0) this.meleeCooldown -= delta;

        const pointer = this.input.activePointer;
        if (this.crosshair) this.crosshair.setPosition(pointer.x, pointer.y);
        if (this.leftHandIndicator) this.leftHandIndicator.setPosition(pointer.x - 22, pointer.y);
        if (this.rightHandIndicator) this.rightHandIndicator.setPosition(pointer.x + 22, pointer.y);
        if (this.crosshair) this.crosshair.setVisible(!this._cssCursorOverlap);   // (用户修复) 暂停也用精灵光标; 过场交接重叠期 (CSS 顶上时) 让位防双鼠标

        if (this.healthSystem) this.healthSystem.update(delta);
        if (this.diseaseSystem) this.diseaseSystem.update(delta);

        // Chest + Hint + CrystalNpc update (必须在 interactSystem 之前)
        if (this._chests) this._chests.forEach(c => c.update());
        if (this._hints) this._hints.forEach(h => h.update());
        if (this._crystalNpcs) this._crystalNpcs.forEach(n => { if (n.update) n.update(); });

        // 宝箱掉落拾取
        if (this._chestDrops && this._chestDrops.length > 0) {
            this._chestDrops = this._chestDrops.filter(d => d && d.active);
            this._chestDrops.forEach(d => {
                if (!d.active || d._flying) return;
                if (d._pickupReadyAt && this.time.now < d._pickupReadyAt) return;
                const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, d.x, d.y);
                if (dist <= 160) {
                    d._flying = true;
                    this.tweens.add({
                        targets: d, x: () => this.player.x, y: () => this.player.y,
                        duration: 250, ease: 'Cubic.easeIn',
                        onUpdate: () => { if (d.scale > 0.5) d.scale -= 0.02; },
                        onComplete: () => {
                            if (d._dropKind === 'crystal') { if (this.hudSystem) this.hudSystem.addCrystal(1); }
                            else if (d._dropKind === 'potion') {
                                const t = d._dropType;
                                if (t === 'life_potion') { if (this.healthSystem) this.healthSystem.addHeart(1); }
                                else if (t === 'healing_potion' || t === 'health_potion') { if (this.inventorySystem) this.inventorySystem.addItem(t, 1); }
                            }
                            if (this.inventorySystem) {
                                if (this.inventorySystem.refreshBackpack) this.inventorySystem.refreshBackpack();
                                if (this.inventorySystem.refreshQuick) this.inventorySystem.refreshQuick();
                            }
                            d.destroy();
                        }
                    });
                }
            });
        }

        // 水晶磁吸拾取 (SZ25 之前漏了, 导致掉落物捡不起)
        if (this.droppedCrystals) {
            this.droppedCrystals.getChildren().forEach(c => {
                if (!c.active || c._flying) return;
                if (c._pickupReadyAt && this.time.now < c._pickupReadyAt) return;
                const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, c.x, c.y);
                if (dist <= 160) {
                    c._flying = true;
                    if (c.body) c.body.enable = false;
                    this.tweens.add({
                        targets: c, x: () => this.player.x, y: () => this.player.y,
                        duration: 250, ease: 'Cubic.easeIn',
                        onUpdate: () => { if (c.scale > 0.5) c.scale -= 0.02; },
                        onComplete: () => {
                            c.destroy();
                            if (this.hudSystem) this.hudSystem.addCrystal(1);
                        }
                    });
                }
            });
        }

        if (this.interactSystem) this.interactSystem.update();

        // R 网格切换 + 中键坐标
        if (this.keyR && Phaser.Input.Keyboard.JustDown(this.keyR)) {
            if (this._gridGraphics) this._gridGraphics.setVisible(!this._gridGraphics.visible);
        }
        if (this._gridGraphics && this._gridGraphics.visible) {
            const middleDown = this.input.activePointer.middleButtonDown();
            if (middleDown && !this._middleClickPrev) {
                this._gridCoordVisible = !this._gridCoordVisible;
                if (!this._gridCoordVisible && this._gridCoordText) { this._gridCoordText.destroy(); this._gridCoordText = null; }
            }
            this._middleClickPrev = middleDown;
            if (this._gridCoordVisible) {
                const ptr = this.input.activePointer;
                const cam = this.cameras.main;
                const wx = cam.scrollX + (ptr.x - cam.width / 2) / cam.zoom + cam.width / 2;
                const wy = cam.scrollY + (ptr.y - cam.height / 2) / cam.zoom + cam.height / 2;
                const gx = Math.floor(wx / 32), gy = Math.floor(wy / 32);
                if (!this._gridCoordText) {
                    this._gridCoordText = this.add.text(0, 0, '', {
                        fontSize: '18px', color: '#00ff00', fontFamily: '"VT323", monospace',
                        align: 'center', stroke: '#000', strokeThickness: 3,
                        backgroundColor: '#000000aa', padding: { x: 6, y: 3 }
                    }).setOrigin(0.5).setDepth(900);
                    if (this.uiCam) this.uiCam.ignore(this._gridCoordText);
                }
                this._gridCoordText.setPosition(wx, wy - 24);
                this._gridCoordText.setText(`(${gx}, ${gy})\nworld:(${Math.floor(wx)}, ${Math.floor(wy)})`);
            }
        } else if (this._gridCoordText) {
            this._gridCoordText.destroy(); this._gridCoordText = null; this._gridCoordVisible = false;
        }

        if (paused || this.isDead) return;

        if (!this.isPlayerStunned && this.movementSystem) this.movementSystem.update(time, delta);

        this._updateRealPickaxes(time, delta);

        // 怪物 update (沿用 GameScene 的距离过滤)
        if (this._updateMonstersFiltered) this._updateMonstersFiltered(time, delta);

        if (this.backpackSystem) {
            const k = Phaser.Input.Keyboard;
            if (this.keyZ && k.JustDown(this.keyZ)) this.backpackSystem.useQuickSlot(0);
            if (this.keyX && k.JustDown(this.keyX)) this.backpackSystem.useQuickSlot(1);
            if (this.keyC && k.JustDown(this.keyC)) this.backpackSystem.useQuickSlot(2);
            if (this.keyB && k.JustDown(this.keyB)) { if (!this.settingsSystem?.isOpen) this.backpackSystem.toggle(); }
        }
        if (this.keyESC && Phaser.Input.Keyboard.JustDown(this.keyESC)) {
            if (!this.backpackSystem?.isOpen) this.settingsSystem?.toggle();
        }

        if (this.inventorySystem) this.inventorySystem.update(delta);
        if (this.dialogSystem) this.dialogSystem.update();
        if (this.hudSystem && this.hudSystem.updateGuideButton) this.hudSystem.updateGuideButton();
    }
}