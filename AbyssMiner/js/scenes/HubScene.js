/**
 * HubScene — 新手村（中央枢纽）
 *
 * 功能：
 *  - 安全区（无怪物）
 *  - Whisker NPC（对话 + 商店）
 *  - 7 个传送门通往 Sector 1~7
 *  - 自动存档点（进入即保存进度到 localStorage）
 *
 * 解锁规则：
 *  - 初始：仅 Sector 1 解锁
 *  - 每打败 Sector N 的 Boss → 解锁 Sector N+1
 *  - 集齐 6 颗 Boss 水晶 → 解锁 Sector 7（终局）
 *
 * 存档结构（localStorage 'abyssMinerSave'）：
 *  {
 *    sectorsUnlocked: [true, false, ...],  // 7 个布尔
 *    bossesDefeated:  [false, false, ...], // 7 个布尔
 *    crystalCount: 1000,
 *    timeSpent: 12345  // 毫秒
 *  }
 */
class HubScene extends MainGameScene {
    constructor() {
        super();
        Phaser.Scene.call(this, { key: 'HubScene' });
    }

    init() {
        this.tutorialId = null;
        this.isHub = true;
        // 加载存档
        this._loadSave();
    }

    preload() {
        if (typeof super.preload === 'function') super.preload();
        // 复用 Tutorial 加载的资源（背景、tile、NPC、玩家），无需重复
    }

    create() {
        if (typeof AudioSystem !== 'undefined') AudioSystem.bgm(this, 'bgm_Hub');  // BGM (Hub.mp3 放进 BGM/ 即生效)
        const G = 32;
        const W = 1888, H = 1280;  // 与 Tutorial 同尺寸

        console.log('[Hub] step 1: setup bounds');
        this.physics.world.setBounds(0, 0, W, H);

        // 背景
        if (this.textures.exists('Tutorial_scene_background_image')) {
            this.bg = this.add.image(W / 2, H / 2, 'Tutorial_scene_background_image');
            const bgScale = Math.max(W / this.bg.width, H / this.bg.height);
            this.bg.setScale(bgScale).setScrollFactor(0).setDepth(-100);
        }

        console.log('[Hub] step 2: state init');
        this._initT1State();  // 复用 MainGameScene 的状态初始化

        console.log('[Hub] step 3: anims');
        this.input.mouse.disableContextMenu();
        if (typeof MainGameScene.prototype.preload === 'function') {
            // 创建动画（如果还没创建）
            if (!this.anims.exists('trader_stand') && this.textures.exists('Trader_stand')) {
                this.anims.create({
                    key: 'trader_stand',
                    frames: this.anims.generateFrameNumbers('Trader_stand', { start: 0, end: 5 }),
                    frameRate: 8, repeat: -1
                });
            }
        }

        console.log('[Hub] step 4: keys');
        this.keyJump   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.keyCrouch = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        this.keyF      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
        this.keyShift  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        this.keyE      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.keyR      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
        this.keyESC    = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

        this.input.keyboard.addCapture([
            Phaser.Input.Keyboard.KeyCodes.SHIFT, Phaser.Input.Keyboard.KeyCodes.SPACE,
            Phaser.Input.Keyboard.KeyCodes.F, Phaser.Input.Keyboard.KeyCodes.E,
            Phaser.Input.Keyboard.KeyCodes.S, Phaser.Input.Keyboard.KeyCodes.A, Phaser.Input.Keyboard.KeyCodes.D,
            Phaser.Input.Keyboard.KeyCodes.R,
            Phaser.Input.Keyboard.KeyCodes.Z, Phaser.Input.Keyboard.KeyCodes.X,
            Phaser.Input.Keyboard.KeyCodes.C, Phaser.Input.Keyboard.KeyCodes.B,
        ]);

        console.log('[Hub] step 5: groups');
        this.walls = this.physics.add.staticGroup();
        this.wallRects = [];
        this.gridSystem = new GridSystem(this, 32, W, H);
        this.spawnPoints = [];
        // 空 group（不会有怪物，但 CameraSystem 需要这些字段）
        this.spiders          = this.physics.add.group();
        this.bungeeSpiders    = this.physics.add.group({ allowGravity: false });
        this.bats             = this.physics.add.group({ allowGravity: false });
        this.earthworms       = this.physics.add.group();
        this.slimes           = this.physics.add.group();
        this.miniSlimes       = this.physics.add.group();
        this.beetles          = this.physics.add.group();
        this.volatileCrystals = this.physics.add.group({ allowGravity: false });
        this.mimicOres        = this.physics.add.group();
        this.cowardMimics     = this.physics.add.group();
        this.droppedCrystals  = this.physics.add.group();

        console.log('[Hub] step 6: geometry');
        this._buildHubGeometry();

        console.log('[Hub] step 7: fog (none in hub - safe zone)');
        // Hub 是安全区，不需要 fog
        // 但 ThrowSystem 等可能依赖 fogSystem 存在，给一个空对象
        this.fogSystem = null;

        console.log('[Hub] step 8: player');
        this.spawnX = 30 * G;   // 出生点：地面中央
        this.spawnY = 30 * G;
        this.player = new Player(this, this.spawnX, this.spawnY);
        this.physics.add.collider(this.player, this.walls, (p, w) => {
            CollisionUtils.onPlayerWallCollide(this, p, w);
        });

        console.log('[Hub] step 9: pickaxes (fake — hub safe zone)');
        this.pick1 = null;
        this.pick2 = null;

        console.log('[Hub] step 10: systems');
        this.movementSystem  = new MovementSystem(this);
        this.dashSystem      = new DashSystem(this);
        this.healthSystem    = new HealthSystem(this);    this.healthSystem.init();
        this.diseaseSystem   = new DiseaseSystem(this);   this.diseaseSystem.init();
        this.inventorySystem = new BackpackSystem(this);  this.inventorySystem.init();
        this.backpackSystem  = this.inventorySystem;
        this.hudSystem       = new HUDSystem(this);       this.hudSystem.init();
        this.settingsSystem  = new SettingsSystem(this);  this.settingsSystem.init();
        this.creativeSystem  = new CreativeSystem(this);  this.creativeSystem.init();
        this.dialogSystem    = new DialogSystem(this);    this.dialogSystem.init();
        this.questSystem     = new QuestSystem(this);     this.questSystem.init();
        this.guideSystem     = new GuideSystem(this);     this.guideSystem.init();
        this.shopSystem      = new ShopSystem(this);      this.shopSystem.init();
        this.interactSystem  = new InteractSystem(this);  this.interactSystem.init();

        console.log('[Hub] step 11: NPC + portals');
        this._spawnHubNPCs();
        this._spawnPortals();

        console.log('[Hub] step 12: camera');
        this.cameraSystem = new CameraSystem(this.cameras.main, this.player);
        this.cameraSystem.setup(W, H);
        this.cameras.main.setZoom(2);
        this.cameras.main.fadeIn(500, 0, 0, 0);   // 进 Hub 时从黑淡入 (配合纯黑底, 转场不硬切/不闪)

        console.log('[Hub] step 13: visuals');
        this.ropeGraphics    = this.add.graphics().setDepth(2);
        this.monsterGraphics = this.add.graphics().setDepth(1);
        this._gridGraphics   = this.add.graphics().setDepth(0);

        console.log('[Hub] step 14: UI cam');
        this.uiCam = this.cameraSystem.setupUICamera(this);

        // 鼠标 + 左右手指示器
        const cursorTex = this.textures.exists('Mouse_cursor') ? 'Mouse_cursor' : 'crosshair_custom';
        this.crosshair          = this.add.sprite(0, 0, cursorTex).setDepth(999999).setScrollFactor(0);
        { const _p0 = this.input && this.input.activePointer; if (_p0) this.crosshair.setPosition(_p0.x, _p0.y); }   // (用户修复) 创建即归位 — 防地图刚显示时光标在 (0,0) 闪没一瞬
        if (cursorTex !== 'Mouse_cursor') this.crosshair.setTint(0xffff00);
        this.leftHandIndicator  = this.add.sprite(0, 0, 'left_hand_icon').setDepth(999998).setVisible(false).setScrollFactor(0);
        this.rightHandIndicator = this.add.sprite(0, 0, 'right_hand_icon').setDepth(999998).setVisible(false).setScrollFactor(0);
        this.input.on('pointermove', (pointer) => {
            if (!this.crosshair) return;
            const sx = pointer.x, sy = pointer.y;
            this.crosshair.setPosition(sx, sy);
            this.leftHandIndicator.setPosition(sx - 22, sy);
            this.rightHandIndicator.setPosition(sx + 22, sy);
        });

        // 玩家攻击（hub 没怪，但保留按键功能避免出错）
        this.input.on('pointerdown', (pointer) => {
            if (!this.player.body || this.isDead) return;
            if (this.shopSystem.isOpen || this.hudSystem.gamePausedByConfirm) return;
            if (this.backpackSystem?.isOpen || this.settingsSystem?.isOpen || this.creativeSystem?.isOpen) return;
            if (this.dialogSystem?.isOpen) return;
        });

        // 自动保存
        this._save();
    }

    /** Hub 的地形：一块大平地 + 上方台阶 + 屋顶 */
    _buildHubGeometry() {
        const G = 32;
        const rectFromCells = (x1, y1, x2, y2) => {
            for (let cx = x1; cx <= x2; cx++) {
                for (let cy = y1; cy <= y2; cy++) {
                    this.createWall(cx * G + G / 2, cy * G + G / 2, G, G);
                }
            }
        };

        // 主地面 (0~58, y=35~39)
        rectFromCells(0, 35, 58, 39);
        // 顶棚 (0~58, y=0~2)
        rectFromCells(0, 0, 58, 2);
        // 左右墙
        rectFromCells(0, 3, 0, 34);
        rectFromCells(58, 3, 58, 34);
        // 中间一个台阶（NPC 站立处）
        rectFromCells(28, 33, 32, 34);
    }

    /** Whisker NPC + 7 个传送门 */
    _spawnHubNPCs() {
        const G = 32;
        // Whisker 在中央台阶上
        this._npcMole = new MoleTrader(this, 30 * G, 32 * G);
        this.moleTrader = this._npcMole;
    }

    _spawnPortals() {
        const G = 32;
        const SECTORS = [
            { id: 1, name: 'SLIME',  col: 8,  row: 25, scene: 'SlimeScene'  },
            { id: 2, name: 'SPIDER', col: 18, row: 25, scene: 'SpiderScene' },
            { id: 3, name: 'WORM',   col: 28, row: 25, scene: 'WormScene'   },
            { id: 4, name: 'MIMIC',  col: 38, row: 25, scene: 'MimicScene'  },
            { id: 5, name: 'GOLEM',  col: 13, row: 18, scene: 'GolemScene'  },
            { id: 6, name: 'BAT',    col: 23, row: 18, scene: 'BatScene'    },
            { id: 7, name: 'FINAL',  col: 33, row: 18, scene: 'FinalScene'  },
        ];

        this._portals = [];
        SECTORS.forEach(sec => {
            const x = sec.col * G + G / 2;
            const y = sec.row * G + G / 2;
            const unlocked = this.save.sectorsUnlocked[sec.id - 1];

            // 传送门视觉：蓝紫色矩形（占位）
            const color = unlocked ? 0x6644ff : 0x333333;
            const portal = this.add.rectangle(x, y, 64, 96, color, 0.7)
                .setStrokeStyle(3, unlocked ? 0xaa88ff : 0x666666);
            portal.setDepth(50);

            // 标签
            const label = this.add.text(x, y - 64, sec.name, {
                fontSize: '20px', color: unlocked ? '#ffffff' : '#666666',
                fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 4
            }).setOrigin(0.5).setDepth(51);

            // ID 标签
            const idLabel = this.add.text(x, y, '' + sec.id, {
                fontSize: '40px', color: unlocked ? '#ffffff' : '#444444',
                fontFamily: '"VT323", monospace',
                stroke: '#000', strokeThickness: 5
            }).setOrigin(0.5).setDepth(52);

            // 锁图标
            if (!unlocked) {
                const lock = this.add.text(x, y + 24, '🔒', { fontSize: '20px' })
                    .setOrigin(0.5).setDepth(53);
                this._portals.push({ ...sec, portal, label, idLabel, lock, unlocked });
            } else {
                this._portals.push({ ...sec, portal, label, idLabel, unlocked });
            }
        });
    }

    /** 玩家在传送门附近时按 E 触发 */
    _checkPortalInteract() {
        if (!this._portals || !this.player) return null;
        for (const p of this._portals) {
            const dx = p.portal.x - this.player.x;
            const dy = p.portal.y - this.player.y;
            if (dx * dx + dy * dy < 80 * 80) {
                return p;
            }
        }
        return null;
    }

    update(time, delta) {
        if (this._uiPaused) return;   // (用户) 设置/guide 打开 → 全场景暂停
        if (typeof super.update === 'function') {
            try { super.update(time, delta); } catch (e) {}
        }

        // 玩家移动
        if (this.player && this.player.body && this.movementSystem) {
            this.movementSystem.update(time, delta);
        }

        // Z/X/C/B/ESC 快捷键
        if (this.backpackSystem) {
            if (this.keyZ && Phaser.Input.Keyboard.JustDown(this.keyZ)) this.backpackSystem.useQuickSlot(0);
            if (this.keyX && Phaser.Input.Keyboard.JustDown(this.keyX)) this.backpackSystem.useQuickSlot(1);
            if (this.keyC && Phaser.Input.Keyboard.JustDown(this.keyC)) this.backpackSystem.useQuickSlot(2);
            if (this.keyB && Phaser.Input.Keyboard.JustDown(this.keyB)) {
                if (!this.settingsSystem?.isOpen) this.backpackSystem.toggle();
            }
        }
        if (this.keyESC && Phaser.Input.Keyboard.JustDown(this.keyESC)) {
            if (!this.backpackSystem?.isOpen) this.settingsSystem?.toggle();
        }

        if (this.inventorySystem) this.inventorySystem.update(delta);
        if (this.dialogSystem) this.dialogSystem.update();

        // 传送门 E 互动
        if (this.keyE && Phaser.Input.Keyboard.JustDown(this.keyE)) {
            const portal = this._checkPortalInteract();
            if (portal) this._tryEnterPortal(portal);
        }

        // crosshair 跟鼠标
        if (this.crosshair) {
            const pointer = this.input.activePointer;
            this.crosshair.setPosition(pointer.x, pointer.y);
            this.leftHandIndicator.setPosition(pointer.x - 22, pointer.y);
            this.rightHandIndicator.setPosition(pointer.x + 22, pointer.y);
        }

        // 商人 update（始终面向玩家）— MoleTrader 自己处理
    }

    _tryEnterPortal(portal) {
        if (!portal.unlocked) {
            this.dialogSystem.show({
                speaker: 'System',
                text: `Sector ${portal.id} is locked. Defeat previous Boss to unlock.`
            });
            return;
        }
        // 进入对应 Scene
        // 现在还没做 Sector Scene，先弹提示
        if (!this.scene.manager.keys[portal.scene]) {
            this.dialogSystem.show({
                speaker: 'System',
                text: `${portal.name} sector — Coming soon!`
            });
            return;
        }
        this._save();
        this.cameras.main.fadeOut(500, 0, 0, 0, (cam, prog) => {
            if (prog === 1) {
                this.scene.start(portal.scene);
            }
        });
    }

    // ── 存档 ──────────────────────────────────────────
    _loadSave() {
        const defaults = {
            sectorsUnlocked: [true, false, false, false, false, false, false],
            bossesDefeated:  [false, false, false, false, false, false, false],
            crystalCount: 1000,
            timeSpent: 0
        };
        try {
            const saved = JSON.parse(localStorage.getItem('abyssMinerSave') || '{}');
            this.save = { ...defaults, ...saved };
        } catch {
            this.save = defaults;
        }
    }

    _save() {
        try {
            localStorage.setItem('abyssMinerSave', JSON.stringify(this.save));
        } catch {}
    }
}