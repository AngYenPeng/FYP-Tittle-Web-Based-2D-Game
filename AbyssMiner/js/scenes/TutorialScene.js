/**
 * TutorialScene — Tutorial 关卡
 * - 不复用 SpawnConfig 的随机地形，自己生成自定义关卡
 * - tutorialId=1：完整教学关卡（AD/SPACE/SHIFT/Click/水晶矿/破石堆/近战门）
 * - tutorialId=2/3：暂时仍用 MainGameScene 默认关卡 + 限制（后续再做）
 */
class TutorialScene extends MainGameScene {
    constructor() {
        super();
        Phaser.Scene.call(this, { key: 'TutorialScene' });
    }

    init(data) {
        this.tutorialId = (data && data.tutorialId) || 1;
    }

    preload() {
        // (用户) 场景重启脏状态复位 — Tutorial 不走 super.preload, 单独补一份
        // (存档点退出会 physics.pause 后离开; world/时钟暂停跨重启存活 → 重进黑屏/全冻结)
        // (用户) Phaser 重启场景时 LoaderPlugin.shutdown 只 reset 文件队列、Systems.shutdown 只清 TRANSITION 事件 —
        // loader 监听器 (complete/loaderror/...) 和自定义场景事件 (monster_killed 等) 全部跨轮残留:
        // 旧闭包在第二轮 loader 完成时摸已销毁对象 → 重进崩溃; 事件处理器翻倍 → 掉落/剧情翻倍. 进 preload 先全清.
        try { this.load.removeAllListeners(); } catch (e) {}
        ['monster_killed', 'slime_split', 'crystal_explode', 'golem_died', 'batboss_defeated', 'spider_queen_died', 'yellow_crystal_dropped']
            .forEach(ev => { try { this.events.off(ev); } catch (e) {} });
        this._uiPaused = false; this._uiPauseLite = false;
        this.isDead = false; this.isPlayerStunned = false;
        this._cinematicLock = false;
        try {
            if (this.physics && this.physics.world) this.physics.world.resume();
            if (this.time) this.time.paused = false;
            if (this.tweens && this.tweens.resumeAll) this.tweens.resumeAll();
            if (this.anims && this.anims.resumeAll) this.anims.resumeAll();
        } catch (e) {}
        // (用户修复) 早期 'none' 移除 — create 冻结黑屏期 (StartIntro→Tutorial 无 Loading 层兜底) 沿用上场景 CSS 光标,
        //   'none' 由精灵创建处接管 (见 crosshair 创建点)
        // (用户) 清掉上一轮残留的显示对象/数组缓存 — lazy 守卫 (if (!this.x)) 第二轮判真跳过重建,
        // 拿已销毁对象继续用 = 重进崩溃; 数组里囤的死对象同理
        this.ropeGraphics = null; this._gridCoordText = null;
        this._pickExtraWalls = null; this._thorns = null;
        this._crystalOres = null; this._deathFragments = null;
        this.uiCam = null; this.pick1 = null; this.pick2 = null;
        this.mobWalls = null; this.playerWalls = null;   // (用户) 懒建组字段 — 死组残留是重进崩溃的元凶 (MobWall children.set)   // (用户) uiCam 在 create 末段才重建, 早段读到旧轮死相机; pick 同理 (墙注册早于稿子重建时拿死稿子挂碰撞器)
        // 加载玩家 spritesheet
        this.load.spritesheet('Miner_stand', 'assets/images/Miner_stand.png', { frameWidth: 128, frameHeight: 128 });
        this.load.spritesheet('Miner_stand_up', 'assets/images/Miner_stand_up.png', { frameWidth: 164, frameHeight: 116 });
        this.load.spritesheet('Miner_dash', 'assets/images/Miner_dash.png', { frameWidth: 160, frameHeight: 80 });   // (用户) 新冲刺图 640×80 / 4 帧
        this.load.spritesheet('melee_attack_slash', 'assets/images/melee_attack_slash.png', { frameWidth: 256, frameHeight: 256 });
        this.load.spritesheet('Miner_run', 'assets/images/Miner_run.png', { frameWidth: 128, frameHeight: 128 });
        this.load.spritesheet('Miner_melee_attack', 'assets/images/Miner_melee_attack.png', { frameWidth: 192, frameHeight: 128 });
        this.load.spritesheet('Miner_jump', 'assets/images/Miner_jump.png', { frameWidth: 128, frameHeight: 128 });
        this.load.spritesheet('Miner_fall', 'assets/images/Miner_fall.png', { frameWidth: 128, frameHeight: 128 });
        this.load.spritesheet('Miner_crouch', 'assets/images/Miner_crouch.png', { frameWidth: 128, frameHeight: 128 });
        this.load.spritesheet('Miner_crouch_walk', 'assets/images/Miner_crouch_walk.png', { frameWidth: 128, frameHeight: 128 });
        this.load.image('Cavetile_wall_T',    'assets/images/Cavetile_wall_T.png');
        this.load.image('Cavetile_wall_TB',   'assets/images/Cavetile_wall_TB.png');
        this.load.image('Cavetile_wall_TR',   'assets/images/Cavetile_wall_TR.png');
        this.load.image('Cavetile_wall_TRB',  'assets/images/Cavetile_wall_TRB.png');
        this.load.image('Cavetile_wall_TRBL', 'assets/images/Cavetile_wall_TRBL.png');
        this.load.image('Cavetile_wall_2L',   'assets/images/Cavetile_wall_2L.png');
        // 第三层及更深：3L1/2/3 普通墙 + 3LC1/2/3 浅层水晶 + 5LC1/2/3 深层水晶
        this.load.image('Cavetile_wall_3L1',  'assets/images/Cavetile_wall_3L1.png');
        this.load.image('Cavetile_wall_3L2',  'assets/images/Cavetile_wall_3L2.png');
        this.load.image('Cavetile_wall_3L3',  'assets/images/Cavetile_wall_3L3.png');
        this.load.image('Cavetile_wall_3LC1', 'assets/images/Cavetile_wall_3LC1.png');
        this.load.image('Cavetile_wall_3LC2', 'assets/images/Cavetile_wall_3LC2.png');
        this.load.image('Cavetile_wall_3LC3', 'assets/images/Cavetile_wall_3LC3.png');
        this.load.image('Cavetile_wall_5LC1', 'assets/images/Cavetile_wall_5LC1.png');
        this.load.image('Cavetile_wall_5LC2', 'assets/images/Cavetile_wall_5LC2.png');
        this.load.image('Cavetile_wall_5LC3', 'assets/images/Cavetile_wall_5LC3.png');
        // BackgroundBlock + SecretDoor
        this.load.image('Background_block', 'assets/images/Background_block.png');
        this.load.image('Secret_door',      'assets/images/Secret_door.png');
        // 平台 4 张皮肤
        this.load.image('Platform_M',  'assets/images/Platform_M.png');
        this.load.image('Platform_L',  'assets/images/Platform_L.png');
        this.load.image('Platform_R',  'assets/images/Platform_R.png');
        this.load.image('Platform_LR', 'assets/images/Platform_LR.png');
        this.load.image('Tutorial_bg_L1', 'assets/images/Tutorial_bg_L1.png');
        this.load.image('Tutorial_bg_L2', 'assets/images/Tutorial_bg_L2.png');
        this.load.image('Tutorial_bg_L3', 'assets/images/Tutorial_bg_L3.png');
        this.load.image('Tutorial_fg_L1', 'assets/images/Tutorial_fg_L1.png');
        this.load.image('Trader_interection_icon', 'assets/images/Trader_interection_icon.png');
        this.load.spritesheet('Trader_stand', 'assets/images/Trader_stand.png', { frameWidth: 48, frameHeight: 48 });
        this.load.spritesheet('Trader_dig', 'assets/images/Trader_dig.png', { frameWidth: 64, frameHeight: 64 });
        // HUD 左上角水晶计数图标
        this.load.image('Crystal', 'assets/images/Crystal.png');
        this.load.image('YCrystal', 'assets/images/YCrystal.png');
        // 水晶矿方块（3 种随机外观）
        this.load.image('Crystal_block_1', 'assets/images/Crystal_block_1.png');
        this.load.image('Crystal_block_2', 'assets/images/Crystal_block_2.png');
        this.load.image('Crystal_block_3', 'assets/images/Crystal_block_3.png');
        this.load.image('YCrystal_block_1', 'assets/images/YCrystal_block_1.png');
        this.load.image('YCrystal_block_2', 'assets/images/YCrystal_block_2.png');
        this.load.image('YCrystal_block_3', 'assets/images/YCrystal_block_3.png');
        // 拟态水晶怪移动动画
        this.load.spritesheet('Mimic_ore_run', 'assets/images/Mimic_ore_run.png', { frameWidth: 32, frameHeight: 32 });

        // 小蜘蛛动画
        this.load.spritesheet('Small_spider_run',     'assets/images/Small_spider_run.png',     { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('Small_spider_attack',  'assets/images/Small_spider_attack.png',  { frameWidth: 64, frameHeight: 64 });
        // (用户) 素材缺失暂停加载, 文件补进 assets 后解开: this.load.spritesheet('Small_spider_injured', 'assets/images/Small_spider_injured.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('Small_spider_dead',    'assets/images/Small_spider_dead.png',    { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('Small_spider_fall',    'assets/images/Small_spider_fall.png',    { frameWidth: 64, frameHeight: 64 });

        // 钥匙门 4 张图（width 32 height 96 = 1格宽 3格高）
        this.load.spritesheet('Key_door_unlocking', 'assets/images/Key_door_unlocking.png', { frameWidth: 96, frameHeight: 96 });
        this.load.image('Key_door_unlocked', 'assets/images/Key_door_unlocked.png');
        this.load.image('Key_door_locked',   'assets/images/Key_door_locked.png');
        this.load.spritesheet('Key_door_open', 'assets/images/Key_door_open.png', { frameWidth: 96, frameHeight: 96 });

        // 水晶门
        this.load.image('Crystal_door_locked', 'assets/images/Crystal_door_locked.png');
        this.load.spritesheet('Crystal_door_open', 'assets/images/Crystal_door_open.png', { frameWidth: 64, frameHeight: 96 });

        // 石门 5 张图
        this.load.image('Stone_door_perfect',     'assets/images/Stone_door_perfect.png');
        this.load.image('Stone_door_small_crack', 'assets/images/Stone_door_small_crack.png');
        this.load.image('Stone_door_more_crack',  'assets/images/Stone_door_more_crack.png');
        this.load.image('Stone_door_injuried',    'assets/images/Stone_door_injuried.png');
        this.load.spritesheet('Stone_door_breaking', 'assets/images/Stone_door_breaking.png', { frameWidth: 96, frameHeight: 96 });
        this.load.image('Stone_door_residue',     'assets/images/Stone_door_residue.png');

        // 自定义鼠标
        this.load.image('Mouse_cursor', 'assets/images/Mouse_cursor.png');

        // 告示牌（32×32）
        this.load.image('Signpost', 'assets/images/Signpost.png');

        // 程序化生成所有像素贴图
        TextureGenerator.generateAll(this);
    }

    create() {
        if (typeof AudioSystem !== 'undefined') AudioSystem.bgm(this, 'bgm_Tutorial');  // BGM
        if (this.tutorialId === 1) {
            // Tutorial 1 用完全自定义关卡
            this._createTutorial1();
        } else {
            // T2/T3 用主关卡 + 限制
            super.create();
            this._applyT2T3Limits();
            this._listenForCompletion();
        }
    }

    // ===========================================================
    // Tutorial 1：完整教学关卡（自定义地形）
    // ===========================================================
    _createTutorial1() {
    // 1. 直接定义地图总尺寸 (W=2208, H=1280) — 比原来宽 10 格（地图右移）
    const W = 2528;
    const H = 1952;

    // 2. 背景设置：直接用 this.cameras.main.width 拿屏幕尺寸，不定义额外的 W
    const sW = this.cameras.main.width;
    const sH = this.cameras.main.height;

    // --- 多层视差背景 (scrollFactor 越小 = 越深 / 越远 / 移动越慢) ---
    // L2 是例外: 完全 fix 在整张地图上 (跟 fg 一样 scrollFactor=1)
    // 全部放在世界中心 (W/2, H/2)，让 parallax 自然展开；图片大小若不够覆盖可调 scale
    const parallaxLayers = [
        { key: 'Tutorial_bg_L3', sf: 0.15, depth: -300, fixedToMap: false },  // 最深 / 最远 / 最慢
        { key: 'Tutorial_bg_L2', sf: 1,    depth: -200, fixedToMap: true  },  // 静止 — 完全贴整张地图
        { key: 'Tutorial_bg_L1', sf: 0.7,  depth: -100, fixedToMap: false },
    ];
    this._bgLayers = [];
    for (const l of parallaxLayers) {
        if (!this.textures.exists(l.key)) continue;
        const img = this.add.image(W / 2, H / 2 + 16, l.key);   // (用户) 背景下移 1 格后再上调 0.5 格 = 净下移 0.5 格
        if (l.fixedToMap) img.setDisplaySize(W, H);  // 缩放到地图同尺寸 1:1
        img.setScrollFactor(l.sf).setDepth(l.depth);
        this._bgLayers.push(img);
    }

    // --- 前景 (1:1 贴在整张地图上，跟世界同步移动，depth 高于雕像 / 大部分内容) ---
    this.fg_L1 = null;
    if (this.textures.exists('Tutorial_fg_L1')) {
        this.fg_L1 = this.add.image(W / 2, H / 2, 'Tutorial_fg_L1');
        this.fg_L1.setDisplaySize(W, H);  // 缩放到跟地图 1:1 同尺寸 (W×H)
        this.fg_L1.setScrollFactor(1).setDepth(820);  // 跟世界一起移动 (无 parallax), depth 大于 fog/雕像
    }

    // console.log('[T1] step 1: setup bounds');   // (用户) 诊断日志静默
    this.physics.world.setBounds(0, 0, W, H);

        // console.log('[T1] step 2: init state');   // (用户) 诊断日志静默
        this._initT1State();

        // console.log('[T1] step 3: anims');   // (用户) 诊断日志静默
        this.input.mouse.disableContextMenu();
        this.anims.create({ key: 'idle', frames: this.anims.generateFrameNumbers('Miner_stand', { start: 0, end: 11 }), frameRate: 12, repeat: -1 });
        if (this.textures.exists('Miner_stand_up')) {
            this.anims.create({ key: 'stand_up', frames: this.anims.generateFrameNumbers('Miner_stand_up', { start: 0, end: 29 }), frameRate: 7.5, repeat: 0 });
        }
        if (this.textures.exists('Miner_dash')) {
            this.anims.create({ key: 'dash', frames: this.anims.generateFrameNumbers('Miner_dash', { start: 0, end: 3 }), frameRate: 24, repeat: 0 });
        }
        if (this.textures.exists('melee_attack_slash')) {
            this.anims.create({ key: 'melee_attack_slash', frames: this.anims.generateFrameNumbers('melee_attack_slash', { start: 0, end: 4 }), frameRate: 24, repeat: 0 });
        }
        this.anims.create({ key: 'run',  frames: this.anims.generateFrameNumbers('Miner_run',   { start: 0, end: 5  }), frameRate: 12, repeat: -1 });
        if (this.textures.exists('Miner_melee_attack')) this.anims.create({ key: 'melee_attack', frames: this.anims.generateFrameNumbers('Miner_melee_attack', { start: 0, end: 2 }), frameRate: 20, repeat: 0 });
        if (this.textures.exists('Miner_jump'))         this.anims.create({ key: 'jump',         frames: this.anims.generateFrameNumbers('Miner_jump',         { start: 0, end: 2 }), frameRate: 14, repeat: 0 });
        if (this.textures.exists('Miner_fall'))         this.anims.create({ key: 'fall',         frames: this.anims.generateFrameNumbers('Miner_fall',         { start: 0, end: 2 }), frameRate: 10, repeat: 0 });
        if (this.textures.exists('Miner_crouch'))       this.anims.create({ key: 'crouch',       frames: this.anims.generateFrameNumbers('Miner_crouch',       { start: 0, end: 5 }), frameRate: 14, repeat: 0 });
        if (this.textures.exists('Miner_crouch_walk'))  this.anims.create({ key: 'crouch_walk',  frames: this.anims.generateFrameNumbers('Miner_crouch_walk',  { start: 0, end: 9 }), frameRate: 14, repeat: -1 });
        if (this.textures.exists('Trader_stand') && !this.anims.exists('trader_stand'))
            this.anims.create({ key: 'trader_stand', frames: this.anims.generateFrameNumbers('Trader_stand', { start: 0, end: 5 }), frameRate: 8, repeat: -1 });
        if (this.textures.exists('Trader_dig') && !this.anims.exists('trader_dig'))
            this.anims.create({ key: 'trader_dig', frames: this.anims.generateFrameNumbers('Trader_dig', { start: 0, end: 21 }), frameRate: 11, repeat: 0 });
        if (this.textures.exists('Mimic_ore_run') && !this.anims.exists('mimic_ore_run')) {
            const t = this.textures.get('Mimic_ore_run');
            const total = t.frameTotal - 2;
            this.anims.create({ key: 'mimic_ore_run', frames: this.anims.generateFrameNumbers('Mimic_ore_run', { start: 0, end: total > 0 ? total : 0 }), frameRate: 10, repeat: -1 });
        }
        // 小蜘蛛动画
        if (this.textures.exists('Small_spider_run') && !this.anims.exists('small_spider_run')) {
            this.anims.create({ key: 'small_spider_run', frames: this.anims.generateFrameNumbers('Small_spider_run', { start: 0, end: 3 }), frameRate: 12, repeat: -1 });
        }
        if (this.textures.exists('Small_spider_attack') && !this.anims.exists('small_spider_attack')) {
            this.anims.create({ key: 'small_spider_attack', frames: this.anims.generateFrameNumbers('Small_spider_attack', { start: 0, end: 2 }), frameRate: 14, repeat: 0 });
        }
        if (this.textures.exists('Small_spider_injured') && !this.anims.exists('small_spider_injured')) {
            this.anims.create({ key: 'small_spider_injured', frames: this.anims.generateFrameNumbers('Small_spider_injured', { start: 0, end: 1 }), frameRate: 12, repeat: 0 });
        }
        if (this.textures.exists('Small_spider_dead') && !this.anims.exists('small_spider_dead')) {
            this.anims.create({ key: 'small_spider_dead', frames: this.anims.generateFrameNumbers('Small_spider_dead', { start: 0, end: 0 }), frameRate: 1, repeat: 0 });
        }
        if (this.textures.exists('Small_spider_fall') && !this.anims.exists('small_spider_fall')) {
            this.anims.create({ key: 'small_spider_fall', frames: this.anims.generateFrameNumbers('Small_spider_fall', { start: 0, end: 2 }), frameRate: 12, repeat: -1 });
        }

        // console.log('[T1] step 4: keys');   // (用户) 诊断日志静默
        this.keyJump   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.keyCrouch = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        this.keyF      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
        this.keyShift  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        this.keyE      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.keyR      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
        this.keyESC    = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
        // Z / X / C / B 由 BackpackSystem._registerKeys() 注册

        this.input.keyboard.addCapture([
            Phaser.Input.Keyboard.KeyCodes.SHIFT, Phaser.Input.Keyboard.KeyCodes.SPACE,
            Phaser.Input.Keyboard.KeyCodes.F, Phaser.Input.Keyboard.KeyCodes.E,
            Phaser.Input.Keyboard.KeyCodes.S, Phaser.Input.Keyboard.KeyCodes.A, Phaser.Input.Keyboard.KeyCodes.D,
            Phaser.Input.Keyboard.KeyCodes.R,
            Phaser.Input.Keyboard.KeyCodes.Z, Phaser.Input.Keyboard.KeyCodes.X,
            Phaser.Input.Keyboard.KeyCodes.C, Phaser.Input.Keyboard.KeyCodes.B,
        ]);

        // console.log('[T1] step 5: groups');   // (用户) 诊断日志静默
        // 物理组
        this.walls = this.physics.add.staticGroup();
        this.wallRects = [];
        this.spiders = this.physics.add.group();
        this.bungeeSpiders = this.physics.add.group();
        this.bats = this.physics.add.group();
        this.earthworms = this.physics.add.group();
        this.slimes = this.physics.add.group();
        this.miniSlimes = this.physics.add.group();
        this.beetles = this.physics.add.group();
        this.volatileCrystals = this.physics.add.group();
        this.mimicOres = this.physics.add.group();
        this.cowardMimics = this.physics.add.group();
        this.droppedCrystals = this.physics.add.group();

        // console.log('[T1] step 6: geometry');   // (用户) 诊断日志静默
        // === GridSystem（格子类型表）必须在 _buildT1Geometry 前建 ===
        this.gridSystem = new GridSystem(this, 32, 2528, 1952);
        // === 关卡地形 ===
        this._buildT1Geometry();

        // === FogSystem（黑雾 / 灰雾）===
        this.fogSystem = new FogSystem(this, 32, 2528, 1952);

        // console.log('[T1] step 7: player');   // (用户) 诊断日志静默

        // 玩家：出生 x 格 5 = 160, y 在地面顶上方一点 = 1040
        this.spawnX = (3.5 + 20) * 32;   // (13.5, 20) 准备自由落体（地图右移10格）
        this.spawnY = 20 * 32;            // 落到 (13, 36) 着地
        this.player = new Player(this, this.spawnX, this.spawnY);
        // 单独加 player↔walls
        this.physics.add.collider(this.player, this.walls);
        // console.log('[T1] collider#0 done: player↔walls');   // (用户) 诊断日志静默
        // console.log('[T1] step 8: pickaxes (fake)');   // (用户) 诊断日志静默

        // T1 不需要铁镐，全部置 null
        // worldList 里的 pick 在 safeIgnore 看到 null 会直接跳过
        // update 里 [pick1,pick2].forEach 会因为 !p.body 跳过整段
        // 但因为 forEach 会先调用 (p, index) => { if (!p.body) return }，p 是 null 会让 .body 报错
        // 所以仍需要假对象
        this.pick1 = { body: null, state: 'idle', isHeavy: false, x: 0, y: 0, parentContainer: null };
        this.pick2 = { body: null, state: 'idle', isHeavy: false, x: 0, y: 0, parentContainer: null };

        // 这些属性是 update 里绳索逻辑需要的，给一些安全默认值
        this.WARNING_DISTANCE = 400;
        this.HEAVY_FLY_LIMIT = 500;
        this.CRITICAL_DISTANCE = 600;
        this.RETRACT_DELAY = 1000;
        this.ropeNodes1 = [];
        this.ropeNodes2 = [];
        this.activeStart1 = 0; this.activeEnd1 = 14;
        this.activeStart2 = 0; this.activeEnd2 = 14;
        this.activeGrapplePick = null;

        // console.log('[T1] step 9: systems');   // (用户) 诊断日志静默
        // 系统
        this.dashSystem    = new DashSystem(this);
        this.movementSystem= new MovementSystem(this);
        this.throwSystem   = new ThrowSystem(this);
        this.grappleSystem = new GrappleSystem(this);
        this.recallSystem  = new RecallSystem(this);
        this.meleeSystem   = new MeleeSystem(this);
        this.healthSystem  = new HealthSystem(this); this.healthSystem.init();
        this.hudSystem     = new HUDSystem(this);    this.hudSystem.init();
        this.inventorySystem = new BackpackSystem(this); this.inventorySystem.init();
        this.backpackSystem  = this.inventorySystem;
        this.settingsSystem  = new SettingsSystem(this);  this.settingsSystem.init();
        this.creativeSystem  = new CreativeSystem(this);  this.creativeSystem.init();
        this.dialogSystem    = new DialogSystem(this);    this.dialogSystem.init();
        this.questSystem     = new QuestSystem(this);     this.questSystem.init();
        this.guideSystem     = new GuideSystem(this);     this.guideSystem.init();
        // (用户) 攻击 + 冲刺 guide 开局即有 (原本走到 38 格才解锁) — 跟 move/jump 一样
        this.guideSystem.registerGuide({
            id: 'attack',
            title: 'Attack',
            animType: 'attack',
            captionText: 'Left Click to attack. Defeat enemies in your path.'
        });
        this.guideSystem.registerGuide({
            id: 'dash',
            title: 'Dash',
            animType: 'dash',
            captionText: 'Hold SHIFT to dash forward. Use it to dodge enemy attacks.'
        });
        this.openingCinematic = new OpeningCinematicSystem(this);
        this.shopSystem    = new ShopSystem(this);
        // Tutorial 1: 商人只卖钥匙（在 init 前覆盖商品列表，让 init 显示正确商品）
        this.shopSystem.items = [
            { id: 'key', name: 'Yellow Key', price: 3, desc: 'Open key doors', tex: 'key_img' }
        ];
        this.shopSystem.init();
        this.interactSystem= new InteractSystem(this);  this.interactSystem.init();
        // console.log('[T1] step 10: T1 limits');   // (用户) 诊断日志静默

        // T1 限制：铁镐由 BackpackSystem 内部管理，初始化时通过 _leftPick/_rightPick 控制
        this.inv = { left: false, right: false };

        // console.log('[T1] step 11: camera');   // (用户) 诊断日志静默
        // 相机
        this.cameraSystem = new CameraSystem(this.cameras.main, this.player);
        this.cameraSystem.setup(W, H);
        this.cameras.main.setZoom(2);

        // console.log('[T1] step 12: dmgCheck/colliders');   // (用户) 诊断日志静默

        // 强制确认每个 wall 都有 staticBody
        this.walls.getChildren().forEach((w, i) => {
            if (!w.body) {
                console.warn(`[T1] wall[${i}] no body! Adding staticBody`);
                this.physics.add.existing(w, true);
            }
        });
        // 输出诊断（已禁用 - wall 数太多）
        // this.walls.getChildren().forEach((w, i) => {
        //     console.log(`[T1] wall[${i}]: hasBody=${!!w.body}, type=${w.type}, x=${w.x}, y=${w.y}`);
        // });
        this.spiders.getChildren().forEach((m, i) => {
            // console.log(`[T1] spider[${i}]: hasBody=${!!m.body}, type=${m.type}`);   // (用户) 诊断日志静默
        });

        // 玩家伤害检测
        const dmgCheck = (p, m) => {
            if (m.canDamagePlayer && m.canDamagePlayer()) {
                this._playerHit(p, m);
                if (m.onHitPlayer) m.onHitPlayer();
            }
        };
        // 一个一个加 collider，错误时不阻止整体运行
        try {
            this.physics.add.overlap(this.player, this.spiders, dmgCheck);
            // console.log('[T1] collider#1 OK: player↔spiders overlap');   // (用户) 诊断日志静默
        } catch(e) { console.error('[T1] collider#1 FAIL:', e.message); }
        try {
            this.physics.add.collider(this.spiders, this.walls);
            // console.log('[T1] collider#2 OK: spiders↔walls');   // (用户) 诊断日志静默
        } catch(e) { console.error('[T1] collider#2 FAIL:', e.message); }
        // 商人 ↔ walls（防止商人掉出地底）
        try {
            if (this._npcMole) {
                this.physics.add.collider(this._npcMole, this.walls);
                // console.log('[T1] collider#mole OK: mole↔walls');   // (用户) 诊断日志静默
            }
        } catch(e) { console.error('[T1] collider#mole FAIL:', e.message); }

        // monster_killed 监听：T1 蜘蛛必掉 1 水晶；水晶掉落 0.5s 内不能拾取
        this.events.on('monster_killed', (mx, my, dropRate) => {
            // T1 蜘蛛必掉 1 颗（覆盖默认 dropRate）
            let actualDrop = dropRate;
            if (this._t1Spider && this._t1Spider._t1MustDrop &&
                Math.abs(mx - this._t1Spider.x) < 50 && Math.abs(my - this._t1Spider.y) < 50) {
                actualDrop = 1;
            }
            if (Math.random() <= actualDrop) {
                const angle = Math.random() * Math.PI * 2;
                const radius = 5 + Math.random() * 10;
                let targetX = mx + Math.cos(angle) * radius;
                let targetY = my + Math.sin(angle) * radius;
                // 防穿模：检查 targetX,targetY 是否在墙内 → 向上推到墙顶
                if (this.wallRects) {
                    for (const w of this.wallRects) {
                        if (targetX >= w.left && targetX <= w.right &&
                            targetY >= w.top && targetY <= w.bottom) {
                            targetY = w.top - 1;  // 推到墙顶上方 1px
                            break;
                        }
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

                const peakY = Math.min(my, targetY) - 30 - Math.random() * 20;
                const dur = 350;
                this.tweens.add({ targets: c, x: targetX, duration: dur, ease: 'Linear' });
                this.tweens.add({ targets: c, angle: 360, duration: dur, ease: 'Linear' });
                this.tweens.add({
                    targets: c, y: peakY, duration: dur / 2, ease: 'Quad.easeOut',
                    onComplete: () => {
                        this.tweens.add({
                            targets: c, y: targetY, duration: dur / 2, ease: 'Quad.easeIn',
                            onComplete: () => { c.angle = 0; }
                        });
                    }
                });
            }
        });

        // 玩家拾取水晶（0.5 秒冷却，距离 160 内拾取）
        try {
            this.physics.add.collider(this.droppedCrystals, this.walls);
            // console.log('[T1] collider#4 OK: droppedCrystals↔walls');   // (用户) 诊断日志静默
        } catch(e) { console.error('[T1] collider#4 FAIL:', e.message); }

        // 鼠标 + 左右手：屏幕坐标 + depth 9999（在所有 UI 之上不被 fog 影响）
        const cursorTex = this.textures.exists('Mouse_cursor') ? 'Mouse_cursor' : 'crosshair_custom';
        this.crosshair          = this.add.sprite(0, 0, cursorTex).setDepth(999999).setScrollFactor(0);   // (用户) 鼠标永远最高显示优先级
        if (cursorTex !== 'Mouse_cursor') this.crosshair.setTint(0xffff00);
        { const _p0 = this.input && this.input.activePointer; if (_p0) this.crosshair.setPosition(_p0.x, _p0.y); }   // (用户修复) 创建即归位
        try { this.game.canvas.style.cursor = 'none'; } catch (e) {}   // (用户) 精灵就位才隐藏 OS 光标
        this.leftHandIndicator  = this.add.sprite(0, 0, 'left_hand_icon').setDepth(999998).setVisible(false).setScrollFactor(0);
        this.rightHandIndicator = this.add.sprite(0, 0, 'right_hand_icon').setDepth(999998).setVisible(false).setScrollFactor(0);
        this.input.on('pointermove', (pointer) => {
            if (!this.crosshair) return;
            const sx = pointer.x, sy = pointer.y;
            this.crosshair.setPosition(sx, sy);
            this.leftHandIndicator.setPosition(sx - 22, sy);
            this.rightHandIndicator.setPosition(sx + 22, sy);
        });
        this.input.on('pointerdown', (pointer) => {
            if (!this.player.body || this.isDead) return;
            if (this.shopSystem.isOpen || this.hudSystem.gamePausedByConfirm) return;
            // 任何 UI 面板打开时玩家都不行动
            if (this.backpackSystem?.isOpen || this.settingsSystem?.isOpen || this.creativeSystem?.isOpen) return;
            if (this.dialogSystem?.isOpen) return;
            // 开场剧情期间锁定
            if (this._cinematicLock) return;
            if (pointer.button === 0) {
                if (this.meleeSystem.execute()) {
                    this._checkMeleeOnT1Targets();
                }
            }
        });

        // console.log('[T1] step 13: visuals');   // (用户) 诊断日志静默
        // 视觉：绳索 / 怪物 (空，但 update 需要)
        this.ropeGraphics    = this.add.graphics().setDepth(2);
        this.monsterGraphics = this.add.graphics().setDepth(1);

        // === 调试格子线条（32×32 网格，方便看格子）===
        this._gridGraphics = this.add.graphics().setDepth(0);
        this._gridGraphics.lineStyle(1, 0xffffff, 0.15);
        const G_W = 2528, G_H = 1952, GS = 32;
        // 垂直线
        for (let x = 0; x <= G_W; x += GS) {
            this._gridGraphics.moveTo(x, 0);
            this._gridGraphics.lineTo(x, G_H);
        }
        // 水平线
        for (let y = 0; y <= G_H; y += GS) {
            this._gridGraphics.moveTo(0, y);
            this._gridGraphics.lineTo(G_W, y);
        }
        this._gridGraphics.strokePath();
        this._gridGraphics.setVisible(false);  // 默认关闭，按 R 切换

        // console.log('[T1] step 14: setupUICamera');   // (用户) 诊断日志静默
        // UI 相机
        this.uiCam = this.cameraSystem.setupUICamera(this);
        // 让 UI 相机忽略背景层和前景
    if (this.uiCam) {
        if (this._bgLayers) {
            for (const layer of this._bgLayers) {
                try { this.uiCam.ignore(layer); } catch(e) {}
            }
        }
        if (this.fg_L1) {
            try { this.uiCam.ignore(this.fg_L1); } catch(e) {}
        }
    }

        // 把 T1 自定义的世界对象（水晶矿、门、石堆、商人、提示标签）让 UI cam ignore
        const ignoreFromUI = (obj, name) => {
            if (!obj) {
                // console.warn('[T1] ignoreFromUI: obj is null for', name);   // (用户) 正常路径会触发 (stoneRubble.label/cracks 设计上为 null), 静默
                return;
            }
            try {
                this.uiCam.ignore(obj);
                // console.log('[T1] uiCam ignored:', name);   // (用户) 诊断日志静默
            } catch(e) {
                console.error('[T1] ignoreFromUI FAIL:', name, e.message);
            }
        };
        if (this._crystalOres) this._crystalOres.forEach((o, i) => ignoreFromUI(o.sprite, 'crystalOre[' + i + ']'));
        if (this._stoneRubble) {
            ignoreFromUI(this._stoneRubble.rect, 'stoneRubble.rect');
            ignoreFromUI(this._stoneRubble.label, 'stoneRubble.label');
            ignoreFromUI(this._stoneRubble.cracks, 'stoneRubble.cracks');
        }
        if (this._crystalDoor) {
            ignoreFromUI(this._crystalDoor.rect, 'crystalDoor.rect');
            if (this._crystalDoor.image) ignoreFromUI(this._crystalDoor.image, 'crystalDoor.image');
        }
        if (this._keyDoor) {
            ignoreFromUI(this._keyDoor.rect, 'keyDoor.rect');
            if (this._keyDoor.image) ignoreFromUI(this._keyDoor.image, 'keyDoor.image');
        }
        if (this._npcMole) {
            ignoreFromUI(this._npcMole, 'npcMole');
            // 【新增】：确保 UI 相机忽略地鼠头上的交互图标
            if (this._npcMole.interactionIcon) {
                ignoreFromUI(this._npcMole.interactionIcon, 'moleInteractionIcon');
            }
        }

        if (this._gridGraphics) ignoreFromUI(this._gridGraphics, 'gridGraphics');
        // FogSystem 的 graphics 让 UI cam ignore（避免遮挡 HUD）
        if (this.fogSystem && this.fogSystem.gfx) {
            ignoreFromUI(this.fogSystem.gfx, 'fogSystem.gfx');
        }
        if (this.fogSystem && this.fogSystem.gradGfx) {
            ignoreFromUI(this.fogSystem.gradGfx, 'fogSystem.gradGfx');
        }
        // BackgroundBlock + SecretDoor 全部 ignore（避免镜头粘贴图）
        // 不输出每个 ignore 的日志（数量太大）
        if (this._backgroundBlocks) {
            this._backgroundBlocks.forEach((b) => {
                if (this.uiCam && b.image) {
                    try { this.uiCam.ignore(b.image); } catch(e) {}
                }
            });
        }
        if (this._secretDoors) {
            this._secretDoors.forEach((d) => {
                if (this.uiCam) {
                    try { this.uiCam.ignore(d.image); } catch(e) {}
                    try { this.uiCam.ignore(d.eIcon); } catch(e) {}
                }
            });
        }
        
        // (用户) 删掉重复的 renderSkins (后面 _listenForCompletion 之后还有一次真正的调用, 少跑一遍全图皮肤计算)

        // console.log('[T1] step 15: hint');   // (用户) 诊断日志静默

        // === 旧 hint 提示已废弃，改用 GuideSystem（! 按钮） ===
        this._t1Stage = 0;
        // this._t1ShowHint('Press A and D to move left or right.');
        // this._t1WatchProgress();

        // 完成监听（用于解锁 T2）
        this._listenForCompletion();

        CavetileWall.renderSkins(this);

        // 关卡进入时从黑屏 fade in（配合 Title 的 fadeOut）
        this.cameras.main.fadeIn(800, 0, 0, 0);

        // === 开场强制剧情 ===
        // 立刻锁定 cinematicLock（防止 100ms 延迟期间狂点左键触发攻击）
        this._cinematicLock = true;
        if (this.openingCinematic) {
            this.time.delayedCall(100, () => this.openingCinematic.start());
        }
    }

    _initT1State() {
        this.lastDashTime = 0; this.dashCooldown = 0;
        this.isDashing = false; this.dashDuration = 120; this.dashSpeed = 1600;
        this.isHanging = false; this.isGrappling = false; this.isCrouching = false;
        this.isPlayerStunned = false; this.isMeleeAttacking = false;
        this.meleeCooldown = 0; this.meleeAttackFlipX = false;
        this.isDead = false;
        this.ropeLength1 = 0; this.ropeLength2 = 0;
    }

    /** 检查玩家是否跨 chunk，如果是则锁定镜头到新 chunk */
    _updateChunkCamera() {
        if (!this._chunks || !this.player) return;
        // 开场剧情期间不切换 chunk（让 cinematic 控制镜头）
        if (this._cinematicLock) return;
        const px = this.player.x / 32;
        const py = this.player.y / 32;
        let newChunk = null;
        for (const c of this._chunks) {
            if (px >= c.x1 && px <= c.x2 + 1 &&
                py >= c.y1 && py <= c.y2 + 1) {
                newChunk = c;
                break;
            }
        }
        if (!newChunk) return;
        if (newChunk.id !== this._currentChunkId) {
            this._currentChunkId = newChunk.id;
            const cam = this.cameras.main;
            const x1 = newChunk.x1 * 32;
            const y1 = newChunk.y1 * 32;
            const w  = (newChunk.x2 - newChunk.x1 + 1) * 32;
            const h  = (newChunk.y2 - newChunk.y1 + 1) * 32;
            cam.setBounds(x1, y1, w, h);
            cam.centerOn(this.player.x, this.player.y);
            // 2 楼 zoom 1.5（= 原本 2 的 0.75 倍，看更宽）
            cam.setZoom(newChunk.id === 'high' ? 1.5 : 2);
        }
    }

    _buildT1Geometry() {
        // ========================================================================
        // T1 关卡（格子 G=32px，世界 3200×1200）
        // 工具：rectFromCells(x1, y1, x2, y2) → 创建 [x1, y1] 到 [x2, y2] 含两端的矩形墙
        // ========================================================================
        const G = 32;
        // ★ 全图水平偏移：所有 *FromCells 调用的 x 自动 +20
        const X_OFFSET = 20;

        const rectFromCells = (x1, y1, x2, y2) => {
            for (let cx = x1 + X_OFFSET; cx <= x2 + X_OFFSET; cx++) {
                for (let cy = y1; cy <= y2; cy++) {
                    this.createWall(cx * G + G / 2, cy * G + G / 2, G, G);
                }
            }
        };
        const platformFromCells = (x1, y1, x2, y2) => {
            for (let cx = x1 + X_OFFSET; cx <= x2 + X_OFFSET; cx++) {
                for (let cy = y1; cy <= y2; cy++) {
                    new PlatformBlock(this, cx * G + G / 2, cy * G + G / 2, G, G);
                }
            }
        };
        const airFromCells = (x1, y1, x2, y2) => {
            for (let cx = x1 + X_OFFSET; cx <= x2 + X_OFFSET; cx++) {
                for (let cy = y1; cy <= y2; cy++) {
                    new AirBlock(this, cx * G + G / 2, cy * G + G / 2, G, G);
                }
            }
        };
        const bgFromCells = (x1, y1, x2, y2) => {
            if (!this._backgroundBlocks) this._backgroundBlocks = [];
            for (let cx = x1 + X_OFFSET; cx <= x2 + X_OFFSET; cx++) {
                for (let cy = y1; cy <= y2; cy++) {
                    const bg = new BackgroundBlock(this, cx * G + G / 2, cy * G + G / 2, G, G);
                    this._backgroundBlocks.push(bg);
                }
            }
        };
        // 暴露给 _applyCreativeOverlay 和门/水晶矿位置使用
        this._mapXOffset = X_OFFSET;

        // === 主地面 (1, 37) ~ (54, 40) — 厚度 4 格 ===
        // 左段
        rectFromCells(1, 37, 24, 40);
        // 右段
        rectFromCells(30, 37, 58, 40);
        // 凹陷下方填底
        rectFromCells(25, 38, 29, 40);
        // 凹陷顶 (25, 37) ~ (29, 37) 补回（之前删了，现在补）
        rectFromCells(25, 37, 29, 37);

        // === 升起的台阶 (10, 35) ~ (24, 36) — 升 2 格高 ===
        rectFromCells(12, 34, 24, 36);
        rectFromCells(19, 31, 24, 33);

        // === 石堆 (63, 34-36) — 1 格宽 3 格高 ===
        this._stoneRubble = new StoneDoor(
            this,
            (43 + 0.5 + 20) * G,  // 渲染 col 63 中心
            (34 + 36 + 1) / 2 * G,
            G,        // 1 格宽
            3 * G,    // 3 格高
            6
        );

        // 之前石门占 (43-44, 34-36) 双格，现在只占 (43, 34-36)，col 44 (渲染 64) 改 air
        airFromCells(44, 34, 44, 36);

        // === 石堆上方墙 (42, 15) ~ (44, 33) — 往下 3 格（原 12~30）===
        rectFromCells(42, 16, 44, 33);

        // === 平台 (45, 14) ~ (48, 14) — 往下 3 格（原 11）===
        // === 单向平台 (45, 13) ~ (55, 13) — 11 格宽 1 格高，从下跳穿、落顶面停留 ===
        platformFromCells(45, 13, 55, 13);

        // === 交替平台 — 全部 y +3 ===
        rectFromCells(52, 33, 55, 33);  // 平台 1 右（原 31）
        rectFromCells(45, 29, 48, 29);  // 平台 2 左（原 28）
        rectFromCells(52, 25, 55, 25);  // 平台 3 右（原 25）
        rectFromCells(45, 21, 48, 21);  // 平台 4 左（原 22）
        rectFromCells(52, 17, 55, 17);  // 平台 5 右（原 19）


        // === 二楼地板 (27, 14) ~ (43, 16) — 往下 3 格（原 11~13）===
        rectFromCells(1, 13, 44, 16);
        rectFromCells(6, 13, 44, 25);

        // === 水晶门 (43, 11) ~ (43, 13) — +10 X 偏移 ===
        this._crystalDoor = new CrystalDoor(
            this,
            (43 + 0.5 + 20) * G,
            (10 + 12 + 1) / 2 * G,
            G,
            3 * G,
            1
        );


        // === 水晶门上方墙 (42, 4) ~ (44, 10) — 往下 3 格（原 1~7）===
        rectFromCells(42, 4, 44, 9);
        rectFromCells(12, 4, 14, 9);

        // === 右边界 (55, 4) ~ (57, 40) — 拆两段，留出 (55, 34) ~ (57, 36) ===
        rectFromCells(56, 4, 58, 36);  // 下段（地面层不变）

        // === 顶部天花板 — 延展全宽（offset 后从 0 到 78）===
        rectFromCells(-20, 0, 58, 3);

        // === 左边界 — 延展（offset 后从 0 列开始）===
        rectFromCells(-20, 4, 0, 40);

        // === 底部填墙：屏幕(0,40) ~ (78,60) — 地图最底铺满 ===
        rectFromCells(-20, 40, 58, 60);

        // === 钥匙门 (13, 10) ~ (13, 12) — +10 X 偏移 ===
        this._keyDoor = new KeyDoor(
            this,
            (13 + 0.5 + 20) * G,
            (10 + 12 + 1) / 2 * G,
            G,
            3 * G
        );

        // === 商人 NPC — 位置 (39, 12) 往下 3 格（原 9）===
        this._npcMole = new MoleTrader(this, (10.5 + 20) * G, 35.5 * G);
        this.moleTrader = this._npcMole;

        // === 水晶矿（位置来自创造模式 export）===
        this._crystalOres = [];
        const oreSpots = [
            { x: (22.5 + 20) * G, y: 11.5 * G },
            { x: (25.5 + 20) * G, y: 10.5 * G },
            { x: (30.5 + 20) * G, y: 12.5 * G },
        ];
        oreSpots.forEach(spot => {
            const ore = new CrystalBlock(this, spot.x, spot.y, { hp: 10, dropCount: 1 });
            this._crystalOres.push(ore);
        });

        // === 创造模式合并的地形修改 ===
        // 墙堆（来自最新 JSON）
        rectFromCells(21, 13, 27, 13);
        rectFromCells(23, 14, 26, 14);
        rectFromCells(22, 12, 27, 12);
        rectFromCells(23, 11, 26, 11);
        // 凹陷洞和路径修改
        airFromCells(12, 34, 13, 34);
        airFromCells(19, 31, 20, 31);
        airFromCells(19, 32, 19, 32);
        airFromCells(24, 31, 24, 31);

        // === 蜘蛛 (位于凹陷区附近，x格 35 地面上) ===
        let spider = new CrystalHunterSpider(this, (35 + 20) * G, 36 * G);
        this.spiders.add(spider);
        spider._t1MustDrop = true;
        this._t1Spider = spider;

        // 不再用近战门
        this._meleeDoor = null;

        // ===========================================================
        // 创造模式叠加 — 在原 T1 关卡基础上修改的额外地形
        // ===========================================================
        this._applyCreativeOverlay(rectFromCells, airFromCells, bgFromCells);

        // ===========================================================
        // Chunk 镜头分区（不影响 fog，仅锁定相机范围）
        // - 镜头完全锁在当前 chunk 内
        // - 玩家跨 chunk 边界 → 镜头瞬间切换到新 chunk
        //
        // chunk_low : y格 13~39（一楼区域）
        // chunk_high: y格 0~13 （二楼区域）
        // ===========================================================
        this._chunks = [
            { id: 'low',  x1: 0,  y1: 13, x2: 78, y2: 60 },
            { id: 'high', x1: 0,  y1: 0,  x2: 78, y2: 14 }
        ];
        this._currentChunkId = null;
    }

    /**
     * 创造模式叠加 — 你在创造模式里手动调整的地形修改
     * 由 Export 出的 JSON 数据简化合并而来
     * （原 T1 关卡保留不动，这里只做加墙 + 抠空气）
     */
    _applyCreativeOverlay(rectFromCells, airFromCells, bgFromCells) {
        // === 新增墙体 ===
        rectFromCells(1, 4, 2, 4);
        rectFromCells(1, 5, 1, 5);
        rectFromCells(1, 11, 1, 12);
        rectFromCells(1, 35, 1, 36);
        rectFromCells(2, 12, 2, 12);
        // (2, 36) 改空气（你之前的需求）
        // rectFromCells(2, 36, 2, 36); — 移除
        airFromCells(2, 36, 2, 36);
        rectFromCells(8, 4, 9, 4);
        rectFromCells(13, 6, 13, 6);
        rectFromCells(15, 4, 16, 4);
        rectFromCells(15, 5, 15, 6);
        rectFromCells(25, 34, 25, 36);
        rectFromCells(26, 36, 26, 36);
        rectFromCells(30, 4, 30, 4);
        rectFromCells(39, 4, 41, 4);
        rectFromCells(40, 5, 41, 5);
        rectFromCells(40, 26, 41, 27);
        rectFromCells(41, 6, 41, 6);
        rectFromCells(41, 28, 41, 29);
        rectFromCells(45, 4, 55, 4);
        rectFromCells(45, 5, 47, 5);
        rectFromCells(45, 6, 46, 6);
        rectFromCells(45, 7, 45, 7);
        rectFromCells(45, 19, 45, 28);
        rectFromCells(46, 20, 46, 23);
        rectFromCells(46, 28, 46, 28);
        rectFromCells(46, 30, 48, 30);
        rectFromCells(47, 21, 47, 22);
        rectFromCells(51, 17, 52, 17);
        rectFromCells(51, 33, 51, 33);
        rectFromCells(52, 5, 55, 5);
        rectFromCells(52, 18, 55, 18);
        rectFromCells(52, 26, 55, 26);
        rectFromCells(52, 34, 55, 34);
        rectFromCells(53, 6, 55, 6);
        rectFromCells(53, 19, 55, 19);
        rectFromCells(53, 35, 55, 36);
        rectFromCells(54, 7, 55, 7);
        rectFromCells(54, 20, 55, 20);
        rectFromCells(54, 24, 55, 24);
        rectFromCells(54, 27, 55, 27);
        rectFromCells(55, 8, 55, 9);
        rectFromCells(55, 16, 55, 17);
        rectFromCells(55, 21, 55, 23);
        rectFromCells(55, 28, 55, 28);

        // === 抠空气（删除原 T1 中的墙体）===
        airFromCells(4, 3, 6, 3);
        airFromCells(6, 23, 6, 25);
        airFromCells(7, 24, 7, 25);
        airFromCells(8, 25, 9, 25);
        airFromCells(11, 3, 12, 3);
        airFromCells(12, 35, 12, 35);
        airFromCells(14, 25, 28, 25);
        airFromCells(16, 24, 27, 24);
        airFromCells(17, 23, 26, 23);
        airFromCells(18, 3, 19, 3);
        airFromCells(18, 22, 25, 22);
        airFromCells(22, 3, 28, 3);
        airFromCells(23, 2, 27, 2);
        airFromCells(25, 1, 26, 1);
        airFromCells(32, 25, 38, 25);
        airFromCells(33, 3, 37, 3);
        airFromCells(33, 24, 37, 24);
        airFromCells(34, 2, 36, 2);
        airFromCells(42, 33, 42, 33);
        airFromCells(44, 30, 44, 31);
        // 来自最新 JSON 的 air
        airFromCells(45, 8, 47, 8);
        airFromCells(48, 7, 48, 7);

        // === 背景方块（来自最新 JSON）===
        if (bgFromCells) {
            bgFromCells(1, 6, 11, 10);
            bgFromCells(2, 5, 11, 5);
            bgFromCells(2, 11, 6, 11);
            bgFromCells(3, 4, 7, 4);
            bgFromCells(3, 12, 21, 12);
            bgFromCells(4, 3, 6, 3);
            bgFromCells(8, 11, 19, 11);
            bgFromCells(10, 4, 11, 4);
            bgFromCells(11, 3, 12, 3);
            bgFromCells(12, 10, 18, 10);
            bgFromCells(15, 7, 16, 9);
            bgFromCells(16, 5, 17, 5);
            bgFromCells(16, 6, 16, 6);
            bgFromCells(17, 4, 18, 4);
            bgFromCells(17, 9, 17, 9);
            bgFromCells(18, 3, 19, 3);
            bgFromCells(25, 1, 26, 2);
            bgFromCells(26, 3, 28, 3);
            bgFromCells(27, 2, 27, 2);
            bgFromCells(28, 4, 29, 4);
            bgFromCells(28, 12, 29, 12);
            bgFromCells(29, 5, 32, 5);
            bgFromCells(29, 10, 31, 11);
            bgFromCells(30, 6, 31, 9);
            bgFromCells(31, 4, 33, 4);
            bgFromCells(31, 12, 32, 12);
            bgFromCells(34, 2, 34, 2);
            bgFromCells(46, 7, 47, 7);
            bgFromCells(47, 6, 49, 6);
            bgFromCells(48, 5, 51, 5);
            // 新加（渲染坐标 53-54, 3 和 55, 2）— 减 20 抵消 helper +20
            bgFromCells(33, 3, 34, 3);
            bgFromCells(35, 2, 35, 2);
            // 渲染 (50, 12) — 水晶矿位置同坐 BG block（不冲突）
            bgFromCells(30, 12, 30, 12);
            // 渲染 (33, 10-12) — 钥匙门位置背景填充
            bgFromCells(13, 10, 13, 12);

            // === 新 JSON overlay (level_1777611901733) ===
            // JSON 里 col 是渲染坐标，helpers 自动 +20，所以这里要减 20
            // 新墙
            rectFromCells(25 - 20, 17, 25 - 20, 17);
            rectFromCells(18 - 20, 20, 18 - 20, 22);
            rectFromCells(19 - 20, 23, 19 - 20, 23);
            rectFromCells(20 - 20, 24, 20 - 20, 24);
            // 新 air（挖洞）
            airFromCells(23 - 20, 29, 23 - 20, 29);
            airFromCells(21 - 20, 32, 21 - 20, 32);
            // 新 BG block 大片
            bgFromCells(21 - 20, 17, 24 - 20, 17);
            bgFromCells(20 - 20, 18, 25 - 20, 18);
            bgFromCells(19 - 20, 19, 25 - 20, 19);
            bgFromCells(19 - 20, 20, 25 - 20, 20);
            bgFromCells(19 - 20, 21, 25 - 20, 21);
            bgFromCells(19 - 20, 22, 24 - 20, 22);
            bgFromCells(20 - 20, 23, 23 - 20, 23);
            bgFromCells(21 - 20, 24, 22 - 20, 24);
            bgFromCells(21 - 20, 25, 21 - 20, 26);

            // === level_1777649865667 export — 5 处 wall → bg_block ===
            airFromCells(32 - 20, 4, 32 - 20, 6);  // col 32 row 4-6
            airFromCells(33 - 20, 4, 33 - 20, 5);  // col 33 row 4-5
            bgFromCells(32 - 20, 4, 32 - 20, 6);
            bgFromCells(33 - 20, 4, 33 - 20, 5);
        }

        // === Secret Door（暂时只有 1 扇，没配对，按 E 会显示 "leads nowhere"）===
        if (typeof SecretDoor !== 'undefined') {
            if (!this._secretDoors) this._secretDoors = [];
            const G = 32;
            this._secretDoors.push(new SecretDoor(this, (7.5 + 20) * G, 11.5 * G, { pairId: 'X' }));
        }

        // === 告示牌生成位置：渲染坐标 (24, 35-36) ===
        this._signposts = [];
        this._signpostSpawned = false;
        this._signpostSpawnX = 24.5 * 32;  // 中心 X (col 24)
        this._signpostSpawnY = 36.5 * 32;  // 中心 Y (row 36) — 1格高
    }









    /** 左键时检测玩家是否在攻击 T1 的特殊目标（石堆 / 门 / 水晶矿） */
    _checkMeleeOnT1Targets() {
        if (!this.player) return;
        const RANGE = 100;
        const px = this.player.x, py = this.player.y;
        const facingRight = !this.player.flipX;

        // 检测石堆（用 StoneDoor entity 的 takeHit）
        if (this._stoneRubble && !this._stoneRubble.destroyed) {
            let sr = this._stoneRubble;
            if (MeleeSystem.inObjectRange(this, sr.x, sr.y)) {   // (用户) 原严格前方 dx>0: 背后0容差+贴脸dx≈0判空 → 统一共享判定
                sr.takeHit();
                if (this.meleeSystem) this.meleeSystem._swingHit = true;   // (用户) 有反应 → 实打实音
                if (typeof MeleeSystem !== 'undefined') {
                    MeleeSystem.playSlashEffect(this, sr.sprite || sr, px, py);
                }
            }
        }
        // 近战门（已删除）
        // 检测水晶矿 — 用 CrystalBlock.takeHit()
        if (this._crystalOres) {
            this._crystalOres.forEach(ore => {
                if (ore.destroyed) return;
                if (MeleeSystem.inObjectRange(this, ore.x, ore.y)) {   // (用户) 同上, 统一共享判定
                    ore.takeHit(3.5);
                    if (this.meleeSystem) this.meleeSystem._swingHit = true;   // (用户) 有反应 → 实打实音
                    if (typeof MeleeSystem !== 'undefined') {
                        MeleeSystem.playSlashEffect(this, ore.sprite || ore, px, py);
                    }
                }
            });
        }
    }

    /** 删除一个 wall 后需要重建 wallRects */
    _rebuildWallRects() {
        this.wallRects = [];
        this.walls.getChildren().forEach(w => {
            this.wallRects.push(new Phaser.Geom.Rectangle(
                w.x - w.width / 2, w.y - w.height / 2, w.width, w.height
            ));
        });
    }

    /** 鼠标中键点击格子时显示坐标 */
    _showGridCoordHint(wx, wy, gx, gy) {
        if (this._gridCoordText) this._gridCoordText.destroy();
        this._gridCoordText = this.add.text(wx, wy - 20,
            `(${gx}, ${gy})\nworld:(${Math.floor(wx)}, ${Math.floor(wy)})`, {
            fontSize: '18px', color: '#00ff00',
            fontFamily: '"VT323", monospace', align: 'center',
            stroke: '#000', strokeThickness: 3,
            backgroundColor: '#000000aa',
            padding: { x: 6, y: 3 }
        }).setOrigin(0.5).setDepth(900);
        if (this.uiCam) this.uiCam.ignore(this._gridCoordText);
        this.time.delayedCall(3000, () => {
            if (this._gridCoordText) {
                this._gridCoordText.destroy();
                this._gridCoordText = null;
            }
        });
    }

    // ===========================================================
    // 教学提示系统
    // ===========================================================
    _t1ShowHint(text) {
        if (this._hintText) this._hintText.destroy();
        const W = this.cameras.main.width;
        this._hintText = this.add.text(W / 2, 80, text, {
            fontSize: '24px', color: '#ffff88',
            fontFamily: '"VT323", monospace', align: 'center',
            stroke: '#000', strokeThickness: 4,
            backgroundColor: '#00000099',
            padding: { x: 16, y: 10 }
        }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(820);

        // 让 mainCam ignore → 只在 uiCam 渲染 → 不被 fog 盖住
        if (this.cameras.main && this._hintText) {
            try { this.cameras.main.ignore(this._hintText); } catch(e) {}
        }
    }

    /** 监控玩家进度切换提示（新关卡布局） */
    _t1WatchProgress() {
        // Stage 0: 起始 — 提示移动
        // 5s 后提示跳跃
        this.time.delayedCall(5000, () => {
            if (this._t1Stage === 0) {
                this._t1Stage = 1;
                this._t1ShowHint('Press SPACE to jump.\nThe ground rises ahead.');
            }
        });

        // Stage 1 → 2: 跳上升起的地面
        // 玩家 y < 1024 且 x > 320 → 已跳上升起的台阶
        // 接下来去打蜘蛛 + 教 SHIFT 冲刺
        // Stage 2: 蜘蛛死 → 提示去破石堆
        this.events.on('monster_killed', (x, y, dropRate) => {
            if (this._t1Stage <= 2 && this._t1Spider && this._t1Spider.hp <= 0) {
                this._t1Stage = 3;
                this._t1ShowHint('Stone pile blocks the way!\nAttack it 6 times to break through.');
            }
        });

        // 定期检测进度
        this._stageWatcher = this.time.addEvent({
            delay: 500, loop: true, callback: () => {
                // 检测玩家是否已上升起的台阶（x>320 且 y<1024）
                if (this._t1Stage === 1 && this.player.x > 320 && this.player.y < 1024) {
                    this._t1Stage = 2;
                    this._t1ShowHint('A spider awaits ahead!\nPress SHIFT to dash, Left Click to attack.');
                }
                // 石堆破了 → 进 stage 4
                else if (this._t1Stage === 3 && this._stoneRubble && this._stoneRubble.destroyed) {
                    this._t1Stage = 4;
                    this._t1ShowHint('Stone pile broken!\nClimb the platforms - jump from side to side.');
                }
                // 玩家到达二楼水晶门附近（x 在门附近 + 在二楼地板上）
                else if (this._t1Stage === 4 && this._crystalDoor && !this._crystalDoor.opened) {
                    let dxDoor = Math.abs(this.player.x - this._crystalDoor.x);
                    if (dxDoor < 200 && this.player.y < 700) {
                        this._t1Stage = 5;
                        this._t1ShowHint('Crystal Door!\nPress E to spend 1 crystal and open it.');
                    }
                }
                // 门开了 → 进 stage 6
                else if (this._t1Stage === 5 && this._crystalDoor && this._crystalDoor.opened) {
                    this._t1Stage = 6;
                    this._t1ShowHint('Door open!\nMeet the trader and mine 3 crystals.');
                }
                // 3 颗水晶矿全破 → 完成
                else if (this._t1Stage === 6 && this._crystalOres) {
                    let allMined = this._crystalOres.every(o => o.destroyed);
                    if (allMined) {
                        this._t1Stage = 7;
                        this._t1ShowHint('Tutorial complete!');
                        this._stageWatcher.remove();
                        this.time.delayedCall(2000, () => this._completeTutorial());
                    }
                }
            }
        });
    }


    _t1OverridePlayerHit(p, m) {
        // T1 蜘蛛打死后不掉水晶
        if (m._t1NoDrop) {
            // 玩家受伤照常处理
        }
    }

    /**
     * Tutorial 1 自定义 update — 不调用继承的 GameScene.update
     * 因为继承的版本会跑绳索/grapple/recall 等 T1 不需要的逻辑
     */
    update(time, delta) {
        if (this._uiPaused) return;   // (用户) 设置/guide 打开 → 全场景暂停
        if (this.tutorialId !== 1) {
            // T2/T3 仍用主关卡 update
            super.update(time, delta);
            if (this._npcMole && this.player) {
            this._npcMole.update(this.player);
        }
            return;
        }

        // T1 自定义 update
        if (!this.player || !this.player.body) return;

        let paused = (this.shopSystem && this.shopSystem.isOpen) ||
                     (this.hudSystem && this.hudSystem.gamePausedByConfirm);

        // 冷却计时
        if (this.dashCooldown > 0)  this.dashCooldown  -= delta;
        if (this.meleeCooldown > 0) this.meleeCooldown -= delta;

        // crosshair 跟鼠标（屏幕坐标）
        if (this.crosshair) {
            const pointer = this.input.activePointer;
            const sx = pointer.x, sy = pointer.y;
            this.crosshair.setPosition(sx, sy);
            this.leftHandIndicator.setPosition(sx - 22, sy);
            this.rightHandIndicator.setPosition(sx + 22, sy);
            if (paused) {
                this.crosshair.setVisible(false);
                this.leftHandIndicator.setVisible(false);
                this.rightHandIndicator.setVisible(false);
            }
        }

        // 死亡倒数
        if (this.healthSystem) this.healthSystem.update(delta);

        // E 键互动
        if (this.interactSystem) this.interactSystem.update();

        // Chunk 系统（fog + 镜头锁定）
        // FogSystem 视野更新（玩家踏足的连通区可见，其他黑/灰雾）
        if (this.fogSystem) this.fogSystem.update(this.player.x, this.player.y);

        // Chunk 镜头切换（玩家跨 y 格 13 边界 → 镜头瞬间切到另一区）
        this._updateChunkCamera();

        // R 键切换网格显示
        if (this.keyR && Phaser.Input.Keyboard.JustDown(this.keyR)) {
            if (this._gridGraphics) {
                this._gridGraphics.setVisible(!this._gridGraphics.visible);
            }
        }
        // 鼠标中键：切换坐标显示（开启时坐标跟随鼠标，再按一次关闭）
        if (this._gridGraphics && this._gridGraphics.visible) {
            // 中键 down 边沿检测
            const middleDown = this.input.activePointer.middleButtonDown();
            if (middleDown && !this._middleClickPrev) {
                this._gridCoordVisible = !this._gridCoordVisible;
                if (!this._gridCoordVisible && this._gridCoordText) {
                    this._gridCoordText.destroy();
                    this._gridCoordText = null;
                }
            }
            this._middleClickPrev = middleDown;

            // 显示开启时：每帧更新坐标位置 + 文字
            if (this._gridCoordVisible) {
                const pointer = this.input.activePointer;
                const cam = this.cameras.main;
                const wx = cam.scrollX + (pointer.x - cam.width / 2) / cam.zoom + cam.width / 2;
                const wy = cam.scrollY + (pointer.y - cam.height / 2) / cam.zoom + cam.height / 2;
                const gx = Math.floor(wx / 32);
                const gy = Math.floor(wy / 32);
                if (!this._gridCoordText) {
                    this._gridCoordText = this.add.text(0, 0, '', {
                        fontSize: '18px', color: '#00ff00',
                        fontFamily: '"VT323", monospace', align: 'center',
                        stroke: '#000', strokeThickness: 3,
                        backgroundColor: '#000000aa',
                        padding: { x: 6, y: 3 }
                    }).setOrigin(0.5).setDepth(900);
                    if (this.uiCam) this.uiCam.ignore(this._gridCoordText);
                }
                this._gridCoordText.setPosition(wx, wy - 24);
                this._gridCoordText.setText(`(${gx}, ${gy})\nworld:(${Math.floor(wx)}, ${Math.floor(wy)})`);
            }
        } else if (this._gridCoordText) {
            // 网格关闭时一并隐藏坐标
            this._gridCoordText.destroy();
            this._gridCoordText = null;
            this._gridCoordVisible = false;
        }

        if (paused || this.isDead) return;

        // 玩家移动 + 跳 + 蹲 + SHIFT 冲刺
        if (!this.isPlayerStunned && this.movementSystem) {
            this.movementSystem.update(time, delta);
            if (this.isMeleeAttacking) this.player.flipX = this.meleeAttackFlipX;
        }

        // 数字键 1-9 选格子
        // Z / X / C 快捷槽使用
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
        if (this.openingCinematic) this.openingCinematic.update(time, delta);
        if (this.hudSystem && this.hudSystem.updateGuideButton) this.hudSystem.updateGuideButton();
        this._checkT1Triggers();

        // 水晶拾起（距离 160 内开始飞向玩家）
        if (this.droppedCrystals) {
            this.droppedCrystals.getChildren().forEach(c => {
                if (!c.active) return;
                if (c._pickupReadyAt && this.time.now < c._pickupReadyAt) return;
                if (c._flying) return;  // 已经在飞向玩家
                const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, c.x, c.y);
                if (dist <= 160) {
                    // 标记飞行中 + 触发飞向玩家 tween
                    c._flying = true;
                    if (c.body) c.body.enable = false;  // 停止物理（改 tween 控制）
                    this.tweens.add({
                        targets: c,
                        x: () => this.player.x,
                        y: () => this.player.y,
                        duration: 250,
                        ease: 'Cubic.easeIn',
                        onUpdate: () => {
                            // 飞行中缩放 + 略微变小
                            if (c.scale > 0.5) c.scale -= 0.02;
                        },
                        onComplete: () => {
                            c.destroy();
                            if (this.hudSystem) this.hudSystem.addCrystal(1);
                        }
                    });
                }
            });
        }

        // 蜘蛛 AI（让蜘蛛追玩家）— 剧情中给假玩家位置（远离）让蜘蛛不追
        if (this.spiders) {
            const target = this._cinematicLock
                ? { x: this.player.x + 999999, y: this.player.y + 999999, body: this.player.body, flipX: false }
                : this.player;
            this.spiders.getChildren().forEach(m => {
                if (m && m.update) m.update(time, delta, target);
            });
        }
    }

    /** 监听各种关卡触发器（告示牌生成、水晶门后剧情） */
    _checkT1Triggers() {
        if (!this.player || !this.player.body) return;
        const G = 32;

        // 1. 玩家在平台 (65-75, 13) 上方/区域 → 生成告示牌
        if (!this._signpostSpawned) {
            // 平台 y=13，渲染坐标 = (65*32 ~ 75*32, 13*32)
            // 触发条件：玩家 x 在平台范围内 + y < 平台 y（在平台上）或 = 平台 y 附近
            const px = this.player.x, py = this.player.y;
            if (px >= 65 * G && px <= 75 * G && py <= 13 * G + G) {
                this._spawnSignpost();
            }
        }

        // 2. 水晶门已开 + 玩家穿过 → 触发剧情
        if (!this._crystalDoorPlotTriggered && this._crystalDoor && this._crystalDoor.opened) {
            if (this.player.x < this._crystalDoor.x - G) {
                this._crystalDoorPlotTriggered = true;
                this._startCrystalDoorPlot();
            }
        }

        // (用户) 战斗 guide (攻击+冲刺) 已改为开局注册 — 见 create() 里 guideSystem.init() 后

        // 4. 玩家靠近石门 5 格内 → 解锁石门 guide
        if (!this._stoneGuideUnlocked && this._stoneRubble && !this._stoneRubble.opened) {
            const dist = Phaser.Math.Distance.Between(
                this.player.x, this.player.y,
                this._stoneRubble.x, this._stoneRubble.y
            );
            if (dist <= 5 * G) {
                this._stoneGuideUnlocked = true;
                if (this.guideSystem && this.guideSystem.registerGuide) {
                    this.guideSystem.registerGuide({
                        id: 'stone_door',
                        title: 'Stone Pile',
                        animType: 'stone',
                        captionText: 'Left Click to break the stone pile. It takes 6 hits.'
                    });
                }
            }
        }

        // 5. 玩家靠近 platform 10 格内 → 解锁 platform guide
        if (!this._platformGuideUnlocked && this.walls && this.walls.getChildren) {
            const px = this.player.x, py = this.player.y;
            for (const w of this.walls.getChildren()) {
                if (!w || !w._isPlatform) continue;
                const dx = w.x - px, dy = w.y - py;
                if (dx * dx + dy * dy <= (10 * G) * (10 * G)) {
                    this._platformGuideUnlocked = true;
                    if (this.guideSystem && this.guideSystem.registerGuide) {
                        this.guideSystem.registerGuide({
                            id: 'platform',
                            title: 'Platform',
                            animType: 'platform',
                            captionText: 'Jump (SPACE) onto a platform from below. Press S while on top to drop down through it.'
                        });
                    }
                    break;
                }
            }
        }
    }

    /** 生成告示牌 */
    _spawnSignpost() {
        if (this._signpostSpawned) return;
        this._signpostSpawned = true;
        if (typeof Signpost === 'undefined') return;
        const sign = new Signpost(this, this._signpostSpawnX, this._signpostSpawnY, {
            w: 32, h: 32, text: 'You should not be here.'
        });
        this._signposts.push(sign);
        // 一个浮现动画
        sign.image.alpha = 0;
        this.tweens.add({ targets: sign.image, alpha: 1, duration: 600 });
    }

    /** 水晶门后剧情：商人说话 + 镜头切水晶 */
    _startCrystalDoorPlot() {
        if (this.openingCinematic && this.openingCinematic.startCrystalDoorPlot) {
            this.openingCinematic.startCrystalDoorPlot();
        }
    }

    _applyT2T3Limits() {
        if (this.tutorialId === 2) {
            this.inv.right = false;
            // 右手铁镐由 BackpackSystem._rightPick 控制，无需操作 slots
        }
        // T3 不限制
    }

    _listenForCompletion() {
        const targets = { 1: null, 2: 8, 3: 12 };  // T1 通过自定义流程完成，不靠杀数
        let killCount = 0;
        let target = targets[this.tutorialId];
        if (!target) return;

        this.events.on('monster_killed', () => {
            killCount++;
            if (killCount >= target) this._completeTutorial();
        });
    }

    _completeTutorial() {
        if (this._completed) return;
        this._completed = true;

        if (this.tutorialId === 1) localStorage.setItem('tutorial_2_unlocked', '1');
        if (this.tutorialId === 2) localStorage.setItem('tutorial_3_unlocked', '1');

        const W = this.cameras.main.width;
        const H = this.cameras.main.height;

        let panel = this.add.container(W / 2, H / 2).setScrollFactor(0).setDepth(500);
        let bg = this.add.rectangle(0, 0, 600, 200, 0x000000, 0.92).setStrokeStyle(3, 0x44ff44);
        let txt = this.add.text(0, -30, '* TUTORIAL COMPLETE *', {
            fontSize: '32px', color: '#44ff44',
            fontFamily: '"VT323", monospace'
        }).setOrigin(0.5);
        let sub = this.add.text(0, 20, 'Entering the Hub...', {
            fontSize: '22px', color: '#aaaaaa',
            fontFamily: '"VT323", monospace'
        }).setOrigin(0.5);
        panel.add([bg, txt, sub]);

        // 标记教学完成 + 解锁 Hub
        try {
            const save = JSON.parse(localStorage.getItem('abyssMinerSave') || '{}');
            save.sectorsUnlocked = save.sectorsUnlocked || [true, false, false, false, false, false, false];
            save.tutorialCompleted = true;
            localStorage.setItem('abyssMinerSave', JSON.stringify(save));
        } catch {}

        this.physics.pause();
        this.time.delayedCall(2500, () => this.scene.start('HubScene'));
    }
}