/**
 * SafeZone1Scene — 1 号安全区
 * 玩家通过 Tutorial SecretDoor 进入这里
 * 场景大小 = 屏幕可视范围（zoom 1.25 下：1280×720）
 * 继承 Tutorial 的物品/背包/水晶等状态
 */
class SafeZone1Scene extends MainGameScene {

    // 真稿子系统 — 直接定义在场景内 (不依赖 GameScene.js)

    // handlePickCollide 内置 (保底, 不靠继承 GameScene)
    handlePickCollide(pick, id) {
        if (!pick.body) return;
        let dtk = id === 1 ? 'dropTimer1' : 'dropTimer2';
        if (pick.state==='flying_max' || pick.state==='flying_gravity' || pick.state==='dropping') {
            // (用户) 穿墙修正: 高速下 arcade 分离可能把稿子推到墙另一侧(视觉穿墙), 之后绳子拉断才被强制收回.
            // 钉墙前先沿来路(绳子路线)回溯: 上一帧好位置→当前位置 线段扫掠(含空气墙), 命中就拉回墙的近侧表面再钉.
            if (pick._lastCX !== undefined) {
                const bcx = pick.body.center.x, bcy = pick.body.center.y;
                if (Math.hypot(bcx - pick._lastCX, bcy - pick._lastCY) <= 400) {   // 异常长段(传送等)不回溯
                    let wl = this.wallRects;
                    if (this._pickExtraWalls && this._pickExtraWalls.length) {
                        wl = wl.concat(this._pickExtraWalls.filter(w => w && w.body).map(w => w.body));
                    }
                    const bk = CollisionUtils.sweptSegmentVsWalls(pick._lastCX, pick._lastCY, bcx, bcy, wl, 6);
                    if (bk.hit) { pick.body.reset(bk.x, bk.y); pick.x = bk.x; pick.y = bk.y; }
                }
            }
            CollisionUtils.resolvePickWallCollision(pick, this.wallRects);
            // 没有轻重之分了 — 打到墙一律钉住 (不收回)
            pick.state = 'attached'; pick.justAttached = true; pick.ignoreZipFrames = 15;
            pick.body.setVelocity(0,0); pick.body.setAllowGravity(false); pick.clearTint();
            if (this[dtk]) { this[dtk].remove(); this[dtk] = null; }
        }
    }

    _setupRealPickaxes() {
        this.inv = { left: true, right: true };
        this.pick1 = new Pickaxe(this, 0, 0);
        this.pick2 = new Pickaxe(this, 0, 0);
        this.pick1.setCollideWorldBounds(true);
        this.pick2.setCollideWorldBounds(true);
        this.physics.add.collider(this.pick1, this.walls, () => this.handlePickCollide(this.pick1, 1));
        this.physics.add.collider(this.pick2, this.walls, () => this.handlePickCollide(this.pick2, 2));
        // (用户) 已登记的空气墙 → 稿子碰撞器 (空气墙对稿子 = 真墙; 处理"墙先建/稿子后建"的顺序)
        if (this._pickExtraWalls) this._pickExtraWalls.forEach(w => this._addPickWallCollider(w));
        this.ropeNodes1 = []; this.ropeNodes2 = [];
        for (let i = 0; i < 15; i++) {
            this.ropeNodes1.push({x:0,y:0,ox:0,oy:0});
            this.ropeNodes2.push({x:0,y:0,ox:0,oy:0});
        }
        this.physics.add.overlap(this.player, [this.pick1, this.pick2], (p, pick) => {
            if (pick.state === 'dropped' || pick.state === 'returning') this.recallSystem.doCollect(pick);
        });
        if (!this.ropeGraphics) {
            this.ropeGraphics = this.add.graphics().setDepth(650);
            if (this.uiCam) { try { this.uiCam.ignore(this.ropeGraphics); } catch(e) {} }
        }
    }

    _updateRealPickaxes(time, delta) {
        if (!this.pick1 || !this.pick1.body) return;
        if (!this.ropeGraphics) return;
        this.ropeGraphics.clear();
        [this.pick1, this.pick2].forEach((p, index) => {
            if (!p.body) return;
            // CCD 防穿墙: 飞行中扫掠这帧 body 移动线, 穿过墙(含空气墙)就回溯钉在墙面
            if ((p.state === 'flying_max' || p.state === 'flying_gravity' || p.state === 'dropping') && this._sweepPickToWall(p)) {
                this.handlePickCollide(p, index === 0 ? 1 : 2);
            }
            let limit = p.isHeavy ? this.HEAVY_FLY_LIMIT : this.WARNING_DISTANCE;
            let rk  = index === 0 ? 'ropeLength1' : 'ropeLength2';
            let dtk = index === 0 ? 'dropTimer1'  : 'dropTimer2';
            let rtk = index === 0 ? 'retractTimer1' : 'retractTimer2';
            let nodes = index === 0 ? this.ropeNodes1 : this.ropeNodes2;
            let aS = index === 0 ? this.activeStart1 : this.activeStart2;
            let aE = index === 0 ? this.activeEnd1   : this.activeEnd2;
            let iPR = p.state === 'pre_returning', iPZ = p.state === 'pre_zipping';
            let iR = p.state === 'returning', iZ = this.isGrappling && this.activeGrapplePick === p;
            let sd = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y);

            if (iPR || iPZ) {
                this[rk] = Math.max(sd, this[rk] - 45000 * (delta/1000));
            } else if (iR || iZ) {
                this[rk] = this.ropePhysics.calculateActualRopeLength(p, aS, aE);
            } else {
                if (p.state === 'attached' || p.state === 'dropping') {
                    let ad = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y);
                    if (ad > this[rk]) this[rk] = ad;
                    else if (p.state === 'attached') this[rk] = Math.max(ad, this[rk] - 2000 * (delta/1000));
                }
                if ((p.state === 'flying_max' || p.state === 'flying_gravity') && sd > limit) {
                    p.state = 'dropping'; this[rk] = limit; p.body.setAllowGravity(true);
                    p.body.velocity.x *= 0.3; if (p.body.velocity.y < 0) p.body.velocity.y = 0;
                    p.hasBounced = false;
                    this[dtk] = this.time.delayedCall(p.isHeavy ? 3000 : 500, () => {
                        if (p.state === 'dropping' || (p.isHeavy && p.state === 'attached')) this.recallSystem.startRecall(p);
                    });
                }
                if (p.state === 'dropping') {
                    let al = this.ropePhysics.calculateActualRopeLength(p, aS, aE);
                    if (al > limit) {
                        let ax = aS <= aE ? nodes[aE].x : this.player.x;
                        let ay = aS <= aE ? nodes[aE].y : this.player.y;
                        let pa = Phaser.Math.Angle.Between(ax, ay, p.x, p.y);
                        let ov = Math.min(al - limit, Phaser.Math.Distance.Between(ax, ay, p.x, p.y) * 0.8);
                        p.x -= Math.cos(pa) * ov * 0.2; p.y -= Math.sin(pa) * ov * 0.2;
                        let dot = p.body.velocity.x * Math.cos(pa) + p.body.velocity.y * Math.sin(pa);
                        if (dot > 0) { p.body.velocity.x -= dot * Math.cos(pa); p.body.velocity.y -= dot * Math.sin(pa); }
                        p.body.velocity.x *= 0.99; p.body.velocity.y *= 0.99;
                    }
                }
            }

            let ms = this.ropePhysics.processVerletRope(p, index);
            if (!iZ && !iPZ) {
                if (ms > 30 && p.state !== 'idle' && p.state !== 'returning') this.recallSystem.startRecall(p, true);
                if (p.state === 'attached') {
                    let al = this.ropePhysics.calculateActualRopeLength(p, aS, aE);
                    if (p.ignoreZipFrames && p.ignoreZipFrames > 0) {
                        p.ignoreZipFrames--;
                    } else {
                        let ws = this.WARNING_DISTANCE / 16, cs = this.CRITICAL_DISTANCE / 16;
                        if (ms > cs && al > this.CRITICAL_DISTANCE * 0.8 && sd > this.CRITICAL_DISTANCE * 0.4)
                            this.recallSystem.startRecall(p);
                        else if (ms > ws && al > this.WARNING_DISTANCE * 0.8 && sd > this.WARNING_DISTANCE * 0.4) {
                            p.setTint(0xff0000);
                            if (!this[rtk]) this[rtk] = this.time.delayedCall(this.RETRACT_DELAY, () => {
                                if (p.state === 'attached') this.recallSystem.startRecall(p);
                                this[rtk] = null;
                            });
                        } else { p.clearTint(); if (this[rtk]) { this[rtk].remove(); this[rtk] = null; } }
                    }
                } else if (p.state === 'dropping') {
                    if (ms > this.WARNING_DISTANCE / 16) p.setTint(0xff0000); else p.clearTint();
                }
            } else { p.clearTint(); }
        });

        this.grappleSystem.update();
        this.recallSystem.update();
        this.throwSystem.updateUI();
    }


    constructor() {
        super();
        Phaser.Scene.call(this, { key: 'SafeZone1Scene' });
    }

    init(data) {
        // 接收上一个场景传来的状态（由 SecretDoor 传入）
        this._inheritedData = data || {};
    }

    preload() {
        if (typeof super.preload === 'function') super.preload();
        // SZ1 三层背景 (L3 最深, L2 中, L1 前景视差)
        this.load.image('sz1_bg_L1', 'assets/images/sz1_bg_L1.png');
        this.load.image('sz1_bg_L2', 'assets/images/sz1_bg_L2.png');
        this.load.image('sz1_bg_L3', 'assets/images/sz1_bg_L3.png');
    }

    create() {
        if (typeof AudioSystem !== 'undefined') AudioSystem.bgm(this, 'bgm_SafeZone1');  // BGM

        // pickaxeUpgraded — 从 registry 读 (跨场景有效, 刷新网页自动重置 — 暂无后台存档)
        this._pickaxeUpgraded = !!this.registry.get('pickaxeUpgraded');
        // 丢稿子距离极限 (砍短, 防飞出屏幕) — 这里覆盖一次, 不依赖 GameScene.js 构造器
        this.WARNING_DISTANCE = 280; this.HEAVY_FLY_LIMIT = 214; this.CRITICAL_DISTANCE = 380;
        // 节点末索引 (15 节点 → 0..14)
        this.activeEnd1 = 14; this.activeEnd2 = 14;
        // 注册怪物 anim — SZ 场景不调 super.create(), 必须自己 register
        this._registerMonsterAnims();

        const G = 32;
        const W = 1280;
        const H = 720;

        this.physics.world.setBounds(0, 0, W, H);

        // === SZ1 3 层背景 (Tutorial L2 同款 — sf=1 跟世界 1:1) ===
        // 3 张图用自然大小 (不缩放, 避免跟障碍物错位)
        // 位置: 地图中心 (1616, -920) 往左 22.5 格 (-720) + 往下 11.5 格 (+368) = (896, -552)
        // scrollFactor=1 → 玩家走时图跟世界 1:1
        // depth: L1 最前 (-101), L2 中 (-102), L3 最深 (-103)
        const hasL1 = this.textures.exists('sz1_bg_L1');
        const hasL2 = this.textures.exists('sz1_bg_L2');
        const hasL3 = this.textures.exists('sz1_bg_L3');

        const bgX = 1616 - 22.5 * 32;   // = 896
        const bgY = -920 + 11.5 * 32;   // = -552

        if (hasL3) {
            this.bgL3 = this.add.image(bgX, bgY, 'sz1_bg_L3');
            this.bgL3.setScrollFactor(1, 1).setDepth(-103);
        }
        if (hasL2) {
            // L2 单独往左 20 格 (-640): bgX - 640 = 256
            this.bgL2 = this.add.image(bgX - 20 * 32, bgY, 'sz1_bg_L2');
            // X 视差 0.5 倍 (玩家:背景=1:0.5), Y 跟世界 1:1 (同 L1)
            this.bgL2.setScrollFactor(0.5, 1).setDepth(-102);
        }
        if (hasL1) {
            this.bgL1 = this.add.image(bgX, bgY, 'sz1_bg_L1');
            this.bgL1.setScrollFactor(1, 1).setDepth(-101);
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
        this._keyT     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);  // DEBUG teleport
        this.keyESC    = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
        this.input.keyboard.addCapture([
            Phaser.Input.Keyboard.KeyCodes.SHIFT,
            Phaser.Input.Keyboard.KeyCodes.SPACE,
            Phaser.Input.Keyboard.KeyCodes.F,
            Phaser.Input.Keyboard.KeyCodes.E,
            Phaser.Input.Keyboard.KeyCodes.S,
            Phaser.Input.Keyboard.KeyCodes.R,
            Phaser.Input.Keyboard.KeyCodes.Z,
            Phaser.Input.Keyboard.KeyCodes.X,
            Phaser.Input.Keyboard.KeyCodes.C,
            Phaser.Input.Keyboard.KeyCodes.B,
        ]);

        // GridSystem
        // GridSystem 覆盖含全部扩展区
        // 左 BUF_L=39（砍 col<-39 的部分），右 BUF_R=50, 上下 BUF=20
        const BUF_T = 20, BUF_B = 20, BUF_L = 39, BUF_R = 50;
        const EXT_R = 50, EXT_T = 100;
        const totalW = W + (BUF_L + BUF_R + EXT_R) * G;
        const totalH = H + (BUF_T + BUF_B + EXT_T) * G;
        const originX = -BUF_L * G;
        const originY = -(BUF_T + EXT_T) * G;
        this.gridSystem = new GridSystem(this, G, totalW, totalH, originX, originY);

        // 物理组
        this.walls = this.physics.add.staticGroup();
        this.platforms = this.physics.add.staticGroup();
        this.bgBlocks = this.physics.add.staticGroup();
        this.crystalBlocks = this.physics.add.staticGroup();
        this.wallRects = [];
        this.droppedCrystals = this.physics.add.group();
        // 怪物组（creative 模式放置怪物用）
        this.spiders = this.physics.add.group();
        this.bungeeSpiders = this.physics.add.group();
        this.bats = this.physics.add.group();
        this.earthworms = this.physics.add.group();
        this.slimes = this.physics.add.group();
        this.beetles = this.physics.add.group();
        this.mimicOres = this.physics.add.group();
        this.volatileCrystals = this.physics.add.group();

        // 地形
        const G_W = Math.floor(W / G);
        const G_H = Math.floor(H / G);
        const rectFromCells = (x1, y1, x2, y2) => {
            for (let cx = x1; cx <= x2; cx++) {
                for (let cy = y1; cy <= y2; cy++) {
                    new CavetileWall(this, cx * G + G / 2, cy * G + G / 2, G, G);
                }
            }
        };
        const bgFromCells = (x1, y1, x2, y2) => {
            // 删除所有 BackgroundBlock — 用户要求 SZ1 不要任何 bg block
        };
        // 内部地形（地板 + 顶 + 左右）
        rectFromCells(0, G_H - 2, G_W - 1, G_H - 1);
        rectFromCells(0, 0, 0, G_H - 3);
        rectFromCells(G_W - 1, 0, G_W - 1, G_H - 3);
        rectFromCells(1, 0, G_W - 2, 0);
        bgFromCells(1, 1, G_W - 2, G_H - 3);

        // 外围 cavetile wall（带皮肤）：上下用 5 格（够皮肤算法显示），左右用 BUF_L/R
        // 玩家看不到深处，远处用 TileSprite 装饰
        const VIS_BUF_T = 5, VIS_BUF_B = 5;
        // 上方（只创建 col 0~89，col -39~-1 上方砍掉）
        for (let cx = 0; cx <= G_W - 1 + BUF_R; cx++) {
            for (let cy = -VIS_BUF_T; cy <= -1; cy++) {
                new Wall(this, cx * G + G / 2, cy * G + G / 2, G, G);
            }
        }
        // 下方
        // row G_H (=22) 那一行 col 0+ 全保留（zone3 下边界）
        for (let cx = 0; cx <= G_W - 1 + BUF_R; cx++) {
            new Wall(this, cx * G + G / 2, G_H * G + G / 2, G, G);
        }
        // row G_H+1 ~ G_H+VIS_BUF_B-1 (=23~26)— 只在 col 0 创建一列
        for (let cy = G_H + 1; cy <= G_H - 1 + VIS_BUF_B; cy++) {
            new Wall(this, 0 * G + G / 2, cy * G + G / 2, G, G);
        }
        // col -39~-1 下方延伸到 row 29
        for (let cx = -BUF_L; cx <= -1; cx++) {
            for (let cy = G_H; cy <= 29; cy++) {
                new Wall(this, cx * G + G / 2, cy * G + G / 2, G, G);
            }
        }
        // col 0 row 27-29 补 cavetile wall（zone1 右下角填满）
        for (let cy = 27; cy <= 29; cy++) {
            new Wall(this, 0 * G + G / 2, cy * G + G / 2, G, G);
        }
        // 左
        for (let cx = -BUF_L; cx <= -1; cx++) {
            for (let cy = 0; cy <= G_H - 1; cy++) {
                new Wall(this, cx * G + G / 2, cy * G + G / 2, G, G);
            }
        }
        // 右
        for (let cx = G_W; cx <= G_W - 1 + BUF_R; cx++) {
            for (let cy = 0; cy <= G_H - 1; cy++) {
                new Wall(this, cx * G + G / 2, cy * G + G / 2, G, G);
            }
        }

        // 应用 level data（来自 creative export）
        this._applyLevelData();

        // 物理边界扩展到包含全部扩展区（右 +50 格 + 上 +100 格）
        this.physics.world.setBounds(
            -BUF_L * G, -100 * G,
            W + (BUF_L + BUF_R + 50) * G, H + (100 + BUF_B) * G
        );

        // (用户) 删掉重复的 renderSkins — 这里跑一遍、后面"渲染 CavetileWall 皮肤"又跑一遍,
        //        全图几千面墙的皮肤计算白做一次, 是重进存档卡顿的大头之一 (真正的调用在后面)

        // 网格线（按 R 切换）
        this._gridGraphics = this.add.graphics().setDepth(0);
        this._gridGraphics.lineStyle(1, 0xffffff, 0.15);
        for (let x = 0; x <= W; x += G) {
            this._gridGraphics.moveTo(x, 0);
            this._gridGraphics.lineTo(x, H);
        }
        for (let y = 0; y <= H; y += G) {
            this._gridGraphics.moveTo(0, y);
            this._gridGraphics.lineTo(W, y);
        }
        this._gridGraphics.strokePath();
        this._gridGraphics.setVisible(false);

        // Z X C 快捷键
        this.keyZ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
        this.keyX = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
        this.keyC = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
        this.keyB = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);

        // 渲染 CavetileWall 皮肤
        if (typeof CavetileWall !== 'undefined' && CavetileWall.renderSkins) {
            CavetileWall.renderSkins(this);
        }

        // 物理子系统
        this.ropePhysics   = new RopePhysics(this);
        this.dashSystem    = new DashSystem(this);
        this.movementSystem= new MovementSystem(this);
        this.throwSystem   = new ThrowSystem(this);
        this.grappleSystem = new GrappleSystem(this);
        this.recallSystem  = new RecallSystem(this);
        this.meleeSystem   = new MeleeSystem(this);

        // 玩家
        // 出生点：world (-25, 18) 是 SecretDoor 位置 — 玩家从 T1 传送过来后站在它上面
        const spawnX = -25 * G + G / 2;
        const spawnY = 18 * G + G / 2;
        this.spawnX = spawnX;
        this.spawnY = spawnY;
        this.player = new Player(this, spawnX, spawnY);

        // 真稿子系统 (替换 stub) — 右键丢/grapple/换手
        this._setupRealPickaxes();
        this._registerPickMonsterHits();

        // 物理碰撞 — T1 同款（platform 用 checkCollision.down=false 单向）
        this.physics.add.collider(this.player, this.walls);
        this.physics.add.collider(this.droppedCrystals, this.walls);
        // 怪物 ↔ walls
        this.physics.add.collider(this.spiders, this.walls);
        this.physics.add.collider(this.bats, this.walls);
        this.physics.add.collider(this.slimes, this.walls);
        this.physics.add.collider(this.beetles, this.walls);
        this.physics.add.collider(this.earthworms, this.walls);
        this.physics.add.collider(this.mimicOres, this.walls);
        this.physics.add.collider(this.bungeeSpiders, this.walls);
        this.physics.add.collider(this.volatileCrystals, this.walls);

        // 玩家伤害检测（同 T1 写法）
        const dmgCheck = (p, m) => {
            if (m.canDamagePlayer && m.canDamagePlayer()) {
                if (this._playerHit) this._playerHit(p, m);
                if (m.onHitPlayer) m.onHitPlayer();
            }
        };
        this.physics.add.overlap(this.player, this.spiders, dmgCheck);
        this.physics.add.overlap(this.player, this.bats, dmgCheck);
        this.physics.add.overlap(this.player, this.slimes, dmgCheck);
        this.physics.add.overlap(this.player, this.beetles, dmgCheck);
        this.physics.add.overlap(this.player, this.earthworms, dmgCheck);
        this.physics.add.overlap(this.player, this.mimicOres, dmgCheck);
        this.physics.add.overlap(this.player, this.bungeeSpiders, dmgCheck);
        this.physics.add.overlap(this.player, this.volatileCrystals, dmgCheck);

        // UI 系统（同 GameScene 顺序）
        this.healthSystem    = new HealthSystem(this);    this.healthSystem.init();
        this.diseaseSystem   = new DiseaseSystem(this);   this.diseaseSystem.init();
        this.inventorySystem = new BackpackSystem(this);  this.inventorySystem.init();
        this.backpackSystem  = this.inventorySystem;
        this.hudSystem       = new HUDSystem(this);       this.hudSystem.init();
        this.settingsSystem  = new SettingsSystem(this);  this.settingsSystem.init();
        if (typeof CreativeSystem !== 'undefined') {
            this.creativeSystem  = new CreativeSystem(this);  this.creativeSystem.init();
        }
        this.dialogSystem    = new DialogSystem(this);    this.dialogSystem.init();
        if (typeof QuestSystem !== 'undefined') {
            this.questSystem     = new QuestSystem(this);     this.questSystem.init();
        }
        this.guideSystem     = new GuideSystem(this);     this.guideSystem.init();
        if (typeof ShopSystem !== 'undefined') {
            this.shopSystem      = new ShopSystem(this);      this.shopSystem.init();
        }
        this.interactSystem  = new InteractSystem(this);  this.interactSystem.init();

        // (用户) 光影黑雾启用 — 按 gridSystem 原点/尺寸 (负坐标地图 OK)
        // 性能: 跨格才重画 + 墙数据健全后 flood 范围有限, 比之前每帧全图重画轻得多
        if (typeof FogSystem !== 'undefined' && this.gridSystem) {
            const _fg = this.gridSystem;
            this.fogSystem = new FogSystem(this, _fg.cellSize, _fg.cols * _fg.cellSize, _fg.rows * _fg.cellSize, _fg.originX || 0, _fg.originY || 0);
        }

        // 怪物掉落监听
        this.events.on('monster_killed', (mx, my, dropRate) => {
            if (Math.random() <= dropRate) {
                const angle = Math.random() * Math.PI * 2;
                const radius = 5 + Math.random() * 10;
                let targetX = mx + Math.cos(angle) * radius;
                let targetY = my + Math.sin(angle) * radius;
                // 防穿模：检查 targetX,targetY 是否在墙内
                if (this.wallRects) {
                    for (const w of this.wallRects) {
                        if (targetX >= w.left && targetX <= w.right &&
                            targetY >= w.top && targetY <= w.bottom) {
                            targetY = w.top - 1;
                            break;
                        }
                    }
                }
                // 用 Crystal 纹理（fallback drop_crystal_img）
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
                // 旋转 360°
                this.tweens.add({ targets: c, angle: 360, duration: 350, ease: 'Linear' });
                const peakY = Math.min(my, targetY) - 30;
                this.tweens.add({
                    targets: c, y: peakY, duration: 175, ease: 'Quad.easeOut',
                    onComplete: () => this.tweens.add({
                        targets: c, y: targetY, duration: 175, ease: 'Quad.easeIn',
                        onComplete: () => { c.angle = 0; }  // 落地后正立
                    })
                });
            }
        });

        // 监听 slime 分裂事件 — 大 Slime 死亡后产生 2 只 mini
        this.events.on('slime_split', (x, y) => {
            for (let i = 0; i < 2; i++) {
                const mini = new CrystalSlime(this, x + (i === 0 ? -20 : 20), y - 10, true);
                this.slimes.add(mini);
                if (mini.setDepth) mini.setDepth(10);
                if (this.uiCam) { try { this.uiCam.ignore(mini); } catch(e) {} }
                this.physics.add.collider(mini, this.walls);
                // mini 不重生（只继承大 slime 的 chunk）
            }
        });

        // 镜头：4 个 chunks
        // zone1（出生区）：(-39, 7) → (0, 29)
        // zone2：左 x=0，右 x=39，上 y=0
        // zone3：左 x=39，右 x=92，上 y=-2，下 y=21.5
        // zone4：左 x=39，右 x=92，下 y=-2 — zone3 上方
        const G_H_FULL = G_H + BUF_B;
        this._chunks = [
            { id: 'zone1', x1: -31,  y1: 9,    x2: 7.5,  y2: 22 },
            { id: 'zone2', x1: 7.5,  y1: 9,    x2: 31.5, y2: 22 },
            { id: 'zone3', x1: 31.5, y1: -2,   x2: 92,   y2: 22 },
            { id: 'zone4', x1: 36,   y1: -46,  x2: 92,   y2: -2 },
            { id: 'zone5', x1: -6,   y1: -36,  x2: 36,   y2: -2 },
            { id: 'zone6', x1: 41,   y1: -64,  x2: 92,   y2: -46 }
        ];
        this._currentChunkId = null;

        // === Mob 透明墙 — 沿每个 chunk 边界 ===
        // 只挡 Mob（玩家可穿过）
        const barrierTh = 4;
        for (const c of this._chunks) {
            const cx1 = c.x1 * G, cx2 = (c.x2 + 1) * G;
            const cy1 = c.y1 * G, cy2 = (c.y2 + 1) * G;
            const w = cx2 - cx1, h = cy2 - cy1;
            new MobWall(this, cx1 + w/2, cy1 - barrierTh/2, w, barrierTh);  // 顶
            new MobWall(this, cx1 + w/2, cy2 + barrierTh/2, w, barrierTh);  // 底
            new MobWall(this, cx1 - barrierTh/2, cy1 + h/2, barrierTh, h);  // 左
            new MobWall(this, cx2 + barrierTh/2, cy1 + h/2, barrierTh, h);  // 右
        }
        // Mob ↔ mobWalls collider
        if (this.mobWalls) {
            ['spiders', 'bats', 'slimes', 'beetles', 'earthworms', 'bungeeSpiders', 'mimicOres', 'volatileCrystals'].forEach(grpName => {
                const grp = this[grpName];
                if (grp) this.physics.add.collider(grp, this.mobWalls);
            });
        }
        this.cameras.main.setZoom(2);
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this._updateChunkCamera();  // 初始化镜头到出生 chunk

        // 鼠标
        const cursorTex = this.textures.exists('Mouse_cursor') ? 'Mouse_cursor' : 'crosshair_custom';
        this.crosshair          = this.add.sprite(0, 0, cursorTex).setDepth(999999).setScrollFactor(0);
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

        // pointerdown
        this.input.on('pointerdown', (pointer) => {
            if (!this.player.body || this.isPlayerStunned || this.isDead) return;
            if (this._cinematicLock) return;
            if (this.shopSystem?.isOpen || this.hudSystem?.gamePausedByConfirm) return;
            if (this.backpackSystem?.isOpen || this.settingsSystem?.isOpen || this.creativeSystem?.isOpen) return;
            if (this.dialogSystem?.isOpen || this.guideSystem?.isOpen) return;
            if (this._suppressNextClick) {
                this._suppressNextClick = false;
                return;
            }
            if (this._isClickOnHUDButton(pointer)) return;

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
                    if (this.meleeSystem.execute()) {
                        this._checkMeleeOnCrystalOres();
                    }
                }
            }
        });

        // UI Camera
        this.cameraSystem = new CameraSystem(this.cameras.main, this.player);
        this.uiCam = this.cameraSystem.setupUICamera(this);

        // uiCam 不渲染世界背景层 (3 个 SZ1 bg + 老 Tutorial bg)
        try {
            if (this.bgL3) this.uiCam.ignore(this.bgL3);
            if (this.bgL2) this.uiCam.ignore(this.bgL2);
            if (this.bgL1) this.uiCam.ignore(this.bgL1);
            if (this.bg)   this.uiCam.ignore(this.bg);
        } catch(e) {}

        // 强制 mainCam ignore crosshair（防止 cameraSystem 顺序问题导致双鼠标）
        try {
            this.cameras.main.ignore(this.crosshair);
            this.cameras.main.ignore(this.leftHandIndicator);
            this.cameras.main.ignore(this.rightHandIndicator);
        } catch(e) {}

        // 全部 wall 加载完后, 重新检测每个 crystal 的旋转 (修复 crystal 在 wall 之前 spawn 的情况)
        if (this._crystalOres) {
            this._crystalOres.forEach(ore => {
                if (ore && ore.redetectRotation) ore.redetectRotation();
            });
        }

        // 继承 Tutorial 状态
        this._applyInheritedState();
        if (typeof SaveSystem !== 'undefined') SaveSystem.autoSave(this);   // 进入区域自动存档

        // 进入剧情过渡
        this._cinematicLock = true;
        this.cameras.main.fadeIn(800);
        this.time.delayedCall(900, () => {
            this._cinematicLock = false;
        });
    }

    _applyInheritedState() {
        const data = this._inheritedData || {};
        if (typeof data.crystalCount === 'number' && this.hudSystem) {
            this.hudSystem.crystalCount = data.crystalCount;
            if (this.hudSystem.refreshCrystal) this.hudSystem.refreshCrystal();
        }
        if (data.inventorySlots && this.inventorySystem) {
            for (let i = 0; i < data.inventorySlots.length; i++) {
                this.inventorySystem.slots[i] = data.inventorySlots[i];
            }
            if (this.inventorySystem.refresh) this.inventorySystem.refresh();
        }
        if (this.healthSystem) {
            if (typeof data.maxHp === 'number') this.healthSystem.maxHp = data.maxHp;
            if (typeof data.hp === 'number')    this.healthSystem.hp = data.hp;
            if (typeof data.hearts === 'number') this.healthSystem.hearts = data.hearts;
            if (this.healthSystem.refresh) this.healthSystem.refresh();
        }
        // 健康侦测仪 — flag 跟着场景跨过来, 同时强制激活腐蚀度条 + 重排 layout
        if (data.hasHealthDetector) {
            this._hasHealthDetector = true;
            if (this.diseaseSystem && this.diseaseSystem.setBarVisible) {
                this.diseaseSystem.setBarVisible(true);
            }
            if (this.hudSystem && this.hudSystem._updateHealthDetectorLayout) {
                this.hudSystem._updateHealthDetectorLayout(true);
            }
        }
        // 腐蚀度进度继承
        if (typeof data.corrosionPct === 'number' && this.diseaseSystem) {
            this.diseaseSystem.corrosionPct = data.corrosionPct;
            if (this.diseaseSystem._updateUI) this.diseaseSystem._updateUI();
        }
        // (用户) 黄水晶继承 — 修换场景丢计数/丢显示
        if (typeof data.yellowCrystalCount === 'number' && this.hudSystem) {
            this.hudSystem.yellowCrystalCount = data.yellowCrystalCount;
            if (data.yellowCrystalShown) this.hudSystem.yellowCrystalShown = false;   // 让 addYellowCrystal(0) 走显示路径
            if (this.hudSystem.addYellowCrystal) this.hudSystem.addYellowCrystal(0);
        }
    }

    _registerAnims() {
        // 安全注册 — 检查 texture 存在 + 有效 frames
        const safeCreate = (key, textureKey, frameCfg, frameRate, repeat) => {
            if (this.anims.exists(key)) return;
            if (!this.textures.exists(textureKey)) return;
            const frames = this.anims.generateFrameNumbers(textureKey, frameCfg);
            if (!frames || frames.length === 0) {
                console.warn('[anims] no frames for', textureKey, frameCfg);
                return;
            }
            this.anims.create({ key, frames, frameRate, repeat });
        };
        safeCreate('idle',          'Miner_stand',        { start: 0, end: 11 }, 12, -1);
        safeCreate('run',           'Miner_run',          { start: 0, end: 5  }, 12, -1);
        safeCreate('melee_attack',  'Miner_melee_attack', { start: 0, end: 2  }, 20, 0);
        safeCreate('jump',          'Miner_jump',         { start: 0, end: 2  }, 14, 0);
        safeCreate('fall',          'Miner_fall',         { start: 0, end: 2  }, 10, 0);
        safeCreate('crouch',        'Miner_crouch',       { start: 0, end: 5  }, 14, 0);
        safeCreate('crouch_walk',   'Miner_crouch_walk',  { start: 0, end: 9  }, 14, -1);
        safeCreate('trader_stand',  'Trader_stand',       { start: 0, end: 5  }, 8, -1);
        // dash 动画
        safeCreate('dash', 'Miner_dash', { start: 0, end: 3 }, 24, 0);
        safeCreate('melee_attack_slash', 'melee_attack_slash', { start: 0, end: 4 }, 24, 0);

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

        // mimic ore 动画
        if (this.textures.exists('Mimic_ore_run') && !this.anims.exists('mimic_ore_run')) {
            const total = this.textures.get('Mimic_ore_run').frameTotal - 2;   // (用户) frameTotal 含 __BASE 基帧
            this.anims.create({ key: 'mimic_ore_run', frames: this.anims.generateFrameNumbers('Mimic_ore_run', { start: 0, end: total > 0 ? total : 0 }), frameRate: 10, repeat: -1 });
        }

        // 史莱姆动画
        if (this.textures.exists('Slime_dead') && !this.anims.exists('slime_dead')) {
            this.anims.create({ key: 'slime_dead', frames: this.anims.generateFrameNumbers('Slime_dead', { start: 0, end: 2 }), frameRate: 8, repeat: 0 });
        }
        if (this.textures.exists('Slime_injuried') && !this.anims.exists('slime_injured')) {
            this.anims.create({ key: 'slime_injured', frames: this.anims.generateFrameNumbers('Slime_injuried', { start: 0, end: 1 }), frameRate: 12, repeat: 0 });
        }
        if (this.textures.exists('Slime_jump') && !this.anims.exists('slime_jump')) {
            this.anims.create({ key: 'slime_jump', frames: this.anims.generateFrameNumbers('Slime_jump', { start: 0, end: 2 }), frameRate: 10, repeat: 0 });
        }
        if (this.textures.exists('Slime_fall') && !this.anims.exists('slime_fall')) {
            this.anims.create({ key: 'slime_fall', frames: this.anims.generateFrameNumbers('Slime_fall', { start: 0, end: 3 }), frameRate: 12, repeat: 0 });
        }
        if (this.textures.exists('Slime_attack') && !this.anims.exists('slime_attack')) {
            this.anims.create({ key: 'slime_attack', frames: this.anims.generateFrameNumbers('Slime_attack', { start: 0, end: 2 }), frameRate: 14, repeat: 0 });
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

    update(time, delta) {
        if (this._uiPaused) return;   // (用户) 设置/guide 打开 → 全场景暂停
        if (!this.player.body) return;

        // Hint 提示 update
        if (this._hints) {
            this._hints.forEach(h => h.update());
        }

        // SZ1 商人剧情 — 玩家靠近 3 格触发一次
        this._checkSZ1MerchantCutscene();
        // KeyDoor 后空气 (92, -5~-7) → fadeOut 黑屏 → 传送到 SafeZone2
        if (!this._teleportingToSafeZone2 &&
            this.player.x >= 92 * 32 && this.player.x <= 93 * 32 &&
            this.player.y >= -7 * 32 && this.player.y <= -4 * 32) {
            this._teleportingToSafeZone2 = true;
            const data = {
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
            this.cameras.main.fadeOut(400, 0, 0, 0);
            this.time.delayedCall(420, () => {
                this.scene.start('SafeZone2Scene', data);
            });
            return;
        }

        let paused = this.shopSystem?.isOpen || this.hudSystem?.gamePausedByConfirm;

        if (this.dashCooldown > 0)  this.dashCooldown  -= delta;
        if (this.meleeCooldown > 0) this.meleeCooldown -= delta;

        let pointer = this.input.activePointer;
        if (this.crosshair) this.crosshair.setPosition(pointer.x, pointer.y);
        if (this.leftHandIndicator) this.leftHandIndicator.setPosition(pointer.x - 22, pointer.y);
        if (this.rightHandIndicator) this.rightHandIndicator.setPosition(pointer.x + 22, pointer.y);

        if (this.crosshair) this.crosshair.setVisible(!this._cssCursorOverlap);   // (用户修复) 暂停也用精灵光标; 过场交接重叠期 (CSS 顶上时) 让位防双鼠标

        if (this.healthSystem) this.healthSystem.update(delta);
        if (this.diseaseSystem) this.diseaseSystem.update(delta);
        // Chest update — 必须放在 interactSystem.update 之前, 否则 InteractSystem 会先消耗 E 键的 JustDown
        if (this._chests) this._chests.forEach(c => c.update());
        if (this.interactSystem) this.interactSystem.update();
        if (this.fogSystem) this.fogSystem.update(this.player.x, this.player.y);

        // R 键切换网格
        if (this.keyR && Phaser.Input.Keyboard.JustDown(this.keyR)) {
            if (this._gridGraphics) {
                this._gridGraphics.setVisible(!this._gridGraphics.visible);
            }
        }
        // T 键 — DEBUG teleport 到 CrystalDoor (75, -34)
        if (this._keyT && Phaser.Input.Keyboard.JustDown(this._keyT)) {
            if (this._crystalDoor) {
                this.player.x = this._crystalDoor.x - 64;
                this.player.y = this._crystalDoor.y;
                // console.log('[SZ1] Teleported to CrystalDoor area:', this.player.x, this.player.y);   // (用户) 诊断日志静默
            }
        }
        // 中键坐标显示（网格开启时）
        if (this._gridGraphics && this._gridGraphics.visible) {
            const middleDown = this.input.activePointer.middleButtonDown();
            if (middleDown && !this._middleClickPrev) {
                this._gridCoordVisible = !this._gridCoordVisible;
                if (!this._gridCoordVisible && this._gridCoordText) {
                    this._gridCoordText.destroy();
                    this._gridCoordText = null;
                }
            }
            this._middleClickPrev = middleDown;

            if (this._gridCoordVisible) {
                const ptr = this.input.activePointer;
                const cam = this.cameras.main;
                const wx = cam.scrollX + (ptr.x - cam.width / 2) / cam.zoom + cam.width / 2;
                const wy = cam.scrollY + (ptr.y - cam.height / 2) / cam.zoom + cam.height / 2;
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
            this._gridCoordText.destroy();
            this._gridCoordText = null;
            this._gridCoordVisible = false;
        }

        if (paused || this.isDead) return;

        if (!this.isPlayerStunned && this.movementSystem) {
            this.movementSystem.update(time, delta);
        this._updateRealPickaxes(time, delta);
        }

        if (this.backpackSystem) {
            const k = Phaser.Input.Keyboard;
            if (this.keyZ && k.JustDown(this.keyZ)) this.backpackSystem.useQuickSlot(0);
            if (this.keyX && k.JustDown(this.keyX)) this.backpackSystem.useQuickSlot(1);
            if (this.keyC && k.JustDown(this.keyC)) this.backpackSystem.useQuickSlot(2);
            if (this.keyB && k.JustDown(this.keyB)) {
                if (!this.settingsSystem?.isOpen) this.backpackSystem.toggle();
            }
        }
        if (this.keyESC && Phaser.Input.Keyboard.JustDown(this.keyESC)) {
            if (!this.backpackSystem?.isOpen) this.settingsSystem?.toggle();
        }

        if (this.inventorySystem) this.inventorySystem.update(delta);
        if (this.dialogSystem) this.dialogSystem.update();
        if (this.hudSystem && this.hudSystem.updateGuideButton) this.hudSystem.updateGuideButton();
        // 怪物 AI — 用 MainGameScene 共用过滤系统 (距离 20×12 + 跨 chunk)
        this._updateMonstersFiltered(time, delta);
        // chunk 镜头切换
        this._updateChunkCamera();
        // platform guide 触发
        this._checkPlatformGuide();
        // 检查 pending respawns
        this._checkPendingRespawns();
        // checkpoint hint + E 交互
        this._checkCheckpoint();
        // Yellow_dirt 扩散
        this._updateYellowDirtSpread(delta);
        // 水晶磁吸拾取
        if (this.droppedCrystals) {
            this.droppedCrystals.getChildren().forEach(c => {
                if (!c.active) return;
                if (c._pickupReadyAt && this.time.now < c._pickupReadyAt) return;
                if (c._flying) return;
                const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, c.x, c.y);
                if (dist <= 160) {
                    c._flying = true;
                    if (c.body) c.body.enable = false;
                    this.tweens.add({
                        targets: c,
                        x: () => this.player.x,
                        y: () => this.player.y,
                        duration: 250,
                        ease: 'Cubic.easeIn',
                        onUpdate: () => { if (c.scale > 0.5) c.scale -= 0.02; },
                        onComplete: () => {
                            c.destroy();
                            if (this.hudSystem) this.hudSystem.addCrystal(1);
                        }
                    });
                }
            });
        }

        // 宝箱掉落物磁吸拾取 (跟 SZ2 同款)
        if (this._chestDrops && this._chestDrops.length > 0) {
            this._chestDrops = this._chestDrops.filter(d => d && d.active);
            this._chestDrops.forEach(d => {
                if (!d.active || d._flying) return;
                if (d._pickupReadyAt && this.time.now < d._pickupReadyAt) return;
                const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, d.x, d.y);
                if (dist <= 160) {
                    d._flying = true;
                    this.tweens.add({
                        targets: d,
                        x: () => this.player.x,
                        y: () => this.player.y,
                        duration: 250,
                        ease: 'Cubic.easeIn',
                        onUpdate: () => { if (d.scale > 0.5) d.scale -= 0.02; },
                        onComplete: () => {
                            if (d._dropKind === 'crystal') {
                                if (this.hudSystem) this.hudSystem.addCrystal(1);
                            } else if (d._dropKind === 'potion') {
                                const t = d._dropType;
                                if (t === 'life_potion') {
                                    if (this.healthSystem) this.healthSystem.addHeart(1);
                                } else if (t === 'healing_potion' || t === 'health_potion') {
                                    if (this.inventorySystem) this.inventorySystem.addItem(t, 1);
                                }
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
    }

    _updateYellowDirtSpread(delta) {
        const sp = this._yellowDirtSpread;
        if (!sp || !sp.active) return;
        sp.radius += (delta / 1000) * 5 * 32;
        const r2 = sp.radius * sp.radius;
        const z2 = this._chunks.find(c => c.id === 'zone2');
        const z2x1 = z2.x1 * 32, z2x2 = (z2.x2 + 1) * 32;
        const z2y1 = z2.y1 * 32, z2y2 = (z2.y2 + 1) * 32;
        if (sp.maxRadius == null) {
            const corners = [
                { x: z2x1, y: z2y1 }, { x: z2x2, y: z2y1 },
                { x: z2x1, y: z2y2 }, { x: z2x2, y: z2y2 }
            ];
            sp.maxRadius = Math.max(...corners.map(c => Math.hypot(c.x - sp.cx, c.y - sp.cy)));
        }
        // 标记坐标（zone2 外的也要染色）
        const markedCells = this._yellowDirtMarkedCells;
        const G = 32;
        const isMarkedPos = (x, y) => {
            for (const [col, row] of markedCells) {
                if (Math.abs(x - (col * G + G / 2)) < 1 && Math.abs(y - (row * G + G / 2)) < 1) return true;
            }
            return false;
        };
        this.children.list.forEach(obj => {
            if (!obj || !obj.texture || !obj.texture.key) return;
            const key = obj.texture.key;
            if (!key.startsWith('Cavetile_wall_')) return;
            const inZone2 = obj.x >= z2x1 && obj.x <= z2x2 && obj.y >= z2y1 && obj.y <= z2y2;
            const isMarked = isMarkedPos(obj.x, obj.y);
            if (!inZone2 && !isMarked) return;
            const dx = obj.x - sp.cx, dy = obj.y - sp.cy;
            if (dx * dx + dy * dy > r2) return;
            const suffix = key.substring('Cavetile_wall_'.length);
            // 神像下方 6 格第一层（col 17~22, row 21）的 _T 皮肤改成 grass_T
            const col = Math.floor(obj.x / G);
            const row = Math.floor(obj.y / G);
            let newKey;
            if (suffix === 'T' && row === 21 && col >= 17 && col <= 22) {
                newKey = 'Yellow_dirt_grass_T';
            } else {
                newKey = 'Yellow_dirt_' + suffix;
            }
            if (this.textures.exists(newKey)) {
                obj.setTexture(newKey);
            }
        });
        if (sp.radius >= sp.maxRadius) {
            sp.active = false;
            this._finalizeYellowDirtSkins();
        }
    }

    /** 扩散结束 — 标记坐标都改成 yellowdirt 对位皮肤（fallback，确保都被染色） */
    _finalizeYellowDirtSkins() {
        const markedCells = this._yellowDirtMarkedCells || [];
        const G = 32;
        for (const [col, row] of markedCells) {
            const cx = col * G + G / 2;
            const cy = row * G + G / 2;
            this.children.list.forEach(obj => {
                if (!obj || !obj.texture || !obj.texture.key) return;
                const key = obj.texture.key;
                if (!key.startsWith('Cavetile_wall_')) return;
                if (Math.abs(obj.x - cx) < 1 && Math.abs(obj.y - cy) < 1) {
                    const suffix = key.substring('Cavetile_wall_'.length);
                    const newKey = 'Yellow_dirt_' + suffix;
                    if (this.textures.exists(newKey)) {
                        obj.setTexture(newKey);
                    }
                }
            });
        }
    }

    _checkCheckpoint() {
        if (!this._checkpoint || !this.player) return;
        const cp = this._checkpoint;
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, cp.x, cp.y);
        const inRange4Cells = dist <= 128;  // 4 格 = 128 px (自动激活范围)
        const inRange = dist <= 100;        // 旧 hint 范围保留
        const inDialog = this.dialogSystem && this.dialogSystem.isOpen;
        cp.setHintVisible(inRange && !inDialog && !cp.activated);
        // SZ1: 不用按 E, 靠近 4 格自动激活 (只触发一次)
        if (!cp.activated && !cp._activating && inRange4Cells && !inDialog && !this._cinematicLock) {
            cp._activate();
        }
        // 玩家靠近已激活 checkpoint (5 格 = 160 px) → 每秒 -1 侵蚀度 + +1 HP
        const inHealRange = dist <= 160;
        if (cp.activated && inHealRange) {
            const now = this.time.now;
            if (!this._checkpointHealNextAt) this._checkpointHealNextAt = now + 1000;
            if (now >= this._checkpointHealNextAt) {
                if (this.healthSystem && this.healthSystem.healAmount) this.healthSystem.healAmount(1);
                if (this.diseaseSystem && this.diseaseSystem.reduceCorrosion) this.diseaseSystem.reduceCorrosion(1);
                this._checkpointHealNextAt = now + 1000;
            }
        } else {
            this._checkpointHealNextAt = 0;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  SZ1 商人剧情 (阶段 9)
    // ═══════════════════════════════════════════════════════════════
    _checkSZ1MerchantCutscene() {
        if (this._sz1MerchantCutsceneDone) return;
        if (!this.moleTrader || !this.player) return;
        if (this._cinematicLock) return;
        if (this.dialogSystem && this.dialogSystem.isOpen) return;

        const dist = Phaser.Math.Distance.Between(
            this.player.x, this.player.y,
            this.moleTrader.x, this.moleTrader.y
        );
        if (dist > 96) return;  // 3 格 = 96 px

        // 优先级保护: 如果 checkpoint 正在激活中 (动画还没播完, 对话还没出)
        // → 玩家停下来锁住, 等 checkpoint 流程走完再开商人剧情
        const cp = this._checkpoint;
        if (cp && cp._activating && !this._sz1MerchantPending) {
            this._sz1MerchantPending = true;
            this._cinematicLock = true;
            if (this.player && this.player.body) {
                this.player.body.setVelocityX(0);
            }
            if (this.player && this.anims.exists('idle') && this.player.play) {
                this.player.play('idle', true);
            }
            // 轮询: 等 checkpoint 不在 activating + 对话也关掉
            const waitCP = this.time.addEvent({
                delay: 200, loop: true, callback: () => {
                    const cpDone = !cp._activating;
                    const noDialog = !(this.dialogSystem && this.dialogSystem.isOpen);
                    if (cpDone && noDialog) {
                        waitCP.remove();
                        this._sz1MerchantPending = false;
                        this._startSZ1MerchantCutscene();  // 会重设 _cinematicLock
                    }
                }
            });
            return;
        }
        // 已经在 pending 中, 等它走完, 不要重复触发
        if (this._sz1MerchantPending) return;

        // 正常路径: 没有 checkpoint 冲突 → 直接开商人剧情
        this._startSZ1MerchantCutscene();
    }

    _startSZ1MerchantCutscene() {
        if (this._sz1MerchantCutsceneStarted) return;
        this._sz1MerchantCutsceneStarted = true;
        this._cinematicLock = true;
        // 锁玩家 + 切回站立动画 (不要保持奔跑帧)
        if (this.player && this.player.body) {
            this.player.body.setVelocityX(0);
            this.player.body.setAllowGravity(true);
        }
        if (this.player && this.anims.exists('idle') && this.player.play) {
            this.player.play('idle', true);
        }
        // 镜头 zoom 2x 对焦 (26, 18) 中心
        const G = 32;
        const focusX = 26 * G + G / 2;
        const focusY = 18 * G + G / 2;
        const cam = this.cameras.main;
        this._savedCameraZoom = cam.zoom;
        cam.stopFollow();
        this.tweens.add({ targets: cam, zoom: 2.0, duration: 600, ease: 'Quad.easeOut' });
        cam.pan(focusX, focusY, 600, 'Quad.easeOut');

        // 等镜头到位再开对话
        this.time.delayedCall(700, () => this._sz1MerchantDialog1());
    }

    _sz1MerchantDialog1() {
        if (!this.dialogSystem) {
            this._endSZ1MerchantCutscene();
            return;
        }
        this.dialogSystem.showSequence([
            { speaker: 'Whisker', text: 'We meet again, kid.' },
            {
                speaker: 'Whisker',
                text: "Good to see you... I've got business to discuss. Care to trade?",
                choices: [
                    { label: 'Yes', action: () => this._sz1MerchantYes() },
                    { label: 'No',  action: () => this._sz1MerchantNo()  }
                ]
            }
        ]);
    }

    _sz1MerchantYes() {
        if (!this.dialogSystem) return;
        this.dialogSystem.close();
        // 打开商店, 等关闭后继续对话
        if (this.shopSystem) this.shopSystem.open();
        // 轮询 shopSystem.isOpen, 等它关闭再 trigger 后续对话
        const poll = this.time.addEvent({
            delay: 100, loop: true, callback: () => {
                if (!this.shopSystem || !this.shopSystem.isOpen) {
                    poll.remove();
                    this._sz1MerchantAfterShop();
                }
            }
        });
    }

    _sz1MerchantNo() {
        if (!this.dialogSystem) return;
        this.dialogSystem.showSequence([
            { speaker: 'Whisker', text: 'Alright then... You can find me near the shrine if you need anything.' },
            { speaker: 'Whisker', text: "It's... ah, a long story. Just come find me when you want to buy something." }
        ], () => this._endSZ1MerchantCutscene());
    }

    _sz1MerchantAfterShop() {
        if (!this.dialogSystem) {
            this._endSZ1MerchantCutscene();
            return;
        }
        this.dialogSystem.showSequence([
            { speaker: 'Whisker', text: 'You can find me near the shrine if you need anything.' },
            { speaker: 'Whisker', text: "It's... ah, a long story. Just come find me when you want to buy something." }
        ], () => this._endSZ1MerchantCutscene());
    }

    _endSZ1MerchantCutscene() {
        this._sz1MerchantCutsceneDone = true;
        // 恢复镜头
        const cam = this.cameras.main;
        const z0 = this._savedCameraZoom || 1.25;
        this.tweens.add({ targets: cam, zoom: z0, duration: 500, ease: 'Quad.easeInOut' });
        if (this.player) cam.startFollow(this.player, true, 0.1, 0.1);
        // 解锁玩家
        this.time.delayedCall(550, () => {
            this._cinematicLock = false;
        });
    }


    /** 玩家近战时检查是否打中水晶矿 */
    _checkMeleeOnCrystalOres() {
        if (!this._crystalOres || !this.player) return;
        // 前方半圆 RANGE=100 + 后方 BACK=32 (半身+0.5格), Y 自然受半圆约束
        const RANGE_SQ = 100 * 100, BACK = 40;
        const px = this.player.x, py = this.player.y;
        const facingRight = !this.player.flipX;
        this._crystalOres.forEach(ore => {
            if (ore.destroyed) return;
            const dx = ore.x - px, dy = ore.y - py;
            if (dx * dx + dy * dy > RANGE_SQ) return;
            if (facingRight && dx < -BACK) return;
            if (!facingRight && dx > BACK) return;
            ore.takeHit(3.5);
            if (this.meleeSystem) this.meleeSystem._swingHit = true;   // (用户) 有反应 → 实打实音
            if (typeof MeleeSystem !== 'undefined') {
                MeleeSystem.playSlashEffect(this, ore.sprite || ore, px, py);
            }
        });
    }

    _checkPendingRespawns() {
        if (!this._pendingRespawns || this._pendingRespawns.length === 0) return;
        if (!this.player) return;
        const px = this.player.x / 32, py = this.player.y / 32;
        const now = this.time.now;
        for (let i = this._pendingRespawns.length - 1; i >= 0; i--) {
            const r = this._pendingRespawns[i];
            if (now < r.readyAt) continue;  // 时间还没到
            // 时间到了 — 检查玩家是否在 home chunk 内
            if (r.homeChunk) {
                const c = r.homeChunk;
                const playerInChunk = (px >= c.x1 && px <= c.x2 + 1 && py >= c.y1 && py <= c.y2 + 1);
                if (!playerInChunk) continue;  // 玩家不在 → 继续等
            }
            // 重生
            this._pendingRespawns.splice(i, 1);
            const m = new r.cls(this, r.x, r.y);
            const grp = this[r.groupName];
            if (grp) grp.add(m);
            if (m.setDepth) m.setDepth(10);
            if (this.uiCam) { try { this.uiCam.ignore(m); } catch(e) {} }
            if (r.groupName === 'bats' && m.body) {
                m.body.setAllowGravity(false);
                m.body.setVelocity(0, 0);
            }
            m._spawnX = r.x;
            m._spawnY = r.y;
            m._spawnClass = r.cls;
            m._spawnGroupName = r.groupName;
            m._homeChunk = r.homeChunk;
            // 监听销毁 → 再次调度
            m.once('destroy', () => {
                const delay = Phaser.Math.Between(300000, 480000);
                this._pendingRespawns.push({
                    cls: r.cls, groupName: r.groupName, x: r.x, y: r.y,
                    homeChunk: r.homeChunk, readyAt: this.time.now + delay
                });
            });
        }
    }

    _checkPlatformGuide() {
        if (this._platformGuideUnlocked || !this.player) return;
        if (!this.guideSystem || !this.guideSystem.registerGuide) return;
        if (!this.walls || !this.walls.getChildren) return;
        const G = 32;
        const px = this.player.x, py = this.player.y;
        const wallChildren = this.walls.getChildren();
        for (const w of wallChildren) {
            if (!w || !w._isPlatform) continue;
            const dx = w.x - px, dy = w.y - py;
            if (dx * dx + dy * dy <= (5 * G) * (5 * G)) {
                this._platformGuideUnlocked = true;
                this.guideSystem.registerGuide({
                    id: 'platform',
                    title: 'Platform',
                    animType: 'platform',
                    captionText: 'Jump (SPACE) onto a platform from below. Press S while on top to drop down through it.'
                });
                break;
            }
        }
    }

    _updateChunkCamera() {
        if (!this._chunks || !this.player) return;
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
        }
    }

    _isInView(x, y, margin = 250) {
        let v = this.cameras.main.worldView;
        return x > v.x - margin && x < v.right + margin && y > v.y - margin && y < v.bottom + margin;
    }

    _isClickOnHUDButton(pointer) {
        const sx = pointer.x, sy = pointer.y;
        const W = this.cameras.main.width;
        const H = this.cameras.main.height;
        if (Math.abs(sx - (W - 40)) < 32 && Math.abs(sy - 40) < 32) return true;
        if (Math.abs(sx - (W - 100)) < 32 && Math.abs(sy - 40) < 32) return true;
        if (Math.abs(sx - 40) < 32 && Math.abs(sy - (H - 40)) < 32) return true;
        if (Math.abs(sx - 60) < 32 && Math.abs(sy - 180) < 32) return true;
        return false;
    }

    /** 应用 level data — 用范围 helpers，减少 code */
    _applyLevelData() {
        const G = 32;

        // helpers
        const airRange = (c1, r1, c2, r2) => {
            const cells = new Set();
            for (let c = c1; c <= c2; c++) for (let r = r1; r <= r2; r++) cells.add(c + ',' + r);
            if (this.walls && this.walls.getChildren) {
                this.walls.getChildren().slice().forEach(w => {
                    const wc = Math.floor(w.x / G), wr = Math.floor(w.y / G);
                    if (cells.has(wc + ',' + wr)) w.destroy();
                });
            }
            if (this.wallRects) {
                this.wallRects = this.wallRects.filter(rect => {
                    const wc = Math.floor((rect.x + rect.width / 2) / G);
                    const wr = Math.floor((rect.y + rect.height / 2) / G);
                    return !cells.has(wc + ',' + wr);
                });
            }
            for (let c = c1; c <= c2; c++) for (let r = r1; r <= r2; r++) {
                if (this.gridSystem) this.gridSystem.markRect(c * G + G / 2, r * G + G / 2, G, G, GridSystem.AIR);
            }
        };
        const bgRange = (c1, r1, c2, r2) => {
            // 删除所有 BackgroundBlock — 用户要求 SZ1 不要任何 bg block
        };
        const wallRange = (c1, r1, c2, r2) => {
            const existing = new Set();
            if (this.walls && this.walls.getChildren) {
                this.walls.getChildren().forEach(w => existing.add(Math.floor(w.x / G) + ',' + Math.floor(w.y / G)));
            }
            for (let c = c1; c <= c2; c++) for (let r = r1; r <= r2; r++) {
                if (existing.has(c + ',' + r)) continue;
                new Wall(this, c * G + G / 2, r * G + G / 2, G, G);
            }
        };
        const airBg = (c1, r1, c2, r2) => { airRange(c1, r1, c2, r2); };  // bg 部分已删

        // === 1 区房间（左侧主房间）— level_1777648018535 ===
        wallRange(-29, 14, -29, 18);
        wallRange(-28, 13, -28, 14);
        wallRange(-27, 12, -27, 13);
        wallRange(-26, 12, -23, 12);
        wallRange(-23, 13, -22, 13);
        wallRange(-22, 14, -21, 14);
        wallRange(-28, 19, -28, 19);
        airBg(-28, 14, -23, 19);
        airBg(-27, 13, -23, 13);
        airBg(-26, 12, -23, 12);
        airBg(-22, 16, 0, 19);
        airBg(-22, 15, 0, 15);
        airBg(-21, 15, -20, 19);
        airBg(0, 14, 0, 14);

        // === 5 cells 在 (32-33, 4-6) — level_1777649865667 ===
        airBg(32, 4, 32, 6);
        airBg(33, 4, 33, 5);

        // === 3 cells 在 (-1~0, 14-15) — level_1777651636433 ===
        airBg(-1, 15, 0, 15);
        airBg(0, 14, 0, 14);

        // === 2 区房间 — level_1777652938312 ===
        airBg(45, 0, 61, 0); airBg(75, 0, 89, 0);
        airBg(44, 1, 89, 1);
        airBg(44, 2, 78, 2); airBg(82, 2, 89, 2);
        airBg(45, 3, 78, 3); airBg(82, 3, 89, 3);
        airBg(58, 4, 67, 4); airBg(71, 4, 89, 4);
        airBg(59, 5, 67, 5); airBg(71, 5, 89, 5);
        airBg(60, 6, 89, 6);
        airBg(60, 7, 73, 7); airBg(77, 7, 85, 7); airBg(89, 7, 89, 7);
        airBg(60, 8, 61, 8); airBg(65, 8, 73, 8); airBg(77, 8, 89, 8);
        airBg(60, 9, 61, 9); airBg(65, 9, 89, 9);
        airBg(59, 10, 82, 10); airBg(86, 10, 89, 10);
        airBg(58, 11, 82, 11); airBg(86, 11, 89, 11);
        airBg(39, 12, 39, 12); airBg(57, 12, 70, 12); airBg(74, 12, 89, 12);
        airBg(39, 13, 40, 13); airBg(56, 13, 70, 13); airBg(74, 13, 89, 13);
        airBg(39, 14, 77, 14); airBg(81, 14, 89, 14);
        airBg(39, 15, 77, 15); airBg(81, 15, 88, 15);
        airBg(39, 16, 63, 16); airBg(67, 16, 87, 16);
        airBg(39, 17, 63, 17); airBg(67, 17, 86, 17);
        airBg(39, 18, 85, 18);
        airBg(39, 19, 83, 19);
        // 2 区柱子 walls
        wallRange(72, 0, 74, 0);
        wallRange(79, 2, 81, 3);
        wallRange(68, 5, 70, 5);
        wallRange(74, 7, 76, 8);
        wallRange(86, 7, 86, 7);
        wallRange(59, 9, 59, 9);
        wallRange(58, 10, 58, 10);
        wallRange(83, 10, 85, 11);
        wallRange(57, 11, 57, 11);
        wallRange(56, 12, 56, 12);
        wallRange(54, 13, 55, 13);
        wallRange(71, 13, 73, 13);
        wallRange(78, 14, 80, 15);
        wallRange(64, 17, 66, 17);

        // === 右侧再扩到 col 93（zone3 右边界）+ 上方 100 格 BG → 用 TileSprite 实现（见下方）===
        // 先 air 让区域可走（不创建独立 BG block 避免上千 image 卡顿）
        airRange(39, -100, 93, -1);
        airRange(90, 0, 93, 22);

        // === level_1777654256180 — 修补 ===
        // walls
        wallRange(-28, 19, -28, 19);
        wallRange(81, 14, 81, 15);
        wallRange(88, 6, 89, 6);
        wallRange(89, 7, 89, 7);
        // bg_block
        airBg(-22, 13, -22, 14);
        airBg(-21, 14, -21, 14);
        airBg(78, 14, 78, 15);
        airBg(86, 7, 87, 7);
        airBg(84, 19, 85, 19);
        airBg(86, 18, 86, 18);
        airBg(87, 17, 87, 17);
        airBg(88, 16, 88, 16);

        // === 远处大块 cavetile 区用 TileSprite（避免上千 wall 卡顿）===
        // 这些区域玩家看到但走不到（被实墙隔离），用 TileSprite 显示纹理即可
        // (90,16) → (93,22) 填满 cavetile wall
        wallRange(90, 16, 93, 22);
        // (90,0) → (93,5) 填满 cavetile wall（顶部）
        wallRange(90, 0, 93, 5);
        // (94,22) 开始往右往上全砍 — 不再创建 col 94+ row<=22 的 wall

        // 远处装饰 TileSprite — 用 Cavetile 纹理（如果存在则用，否则跳过）
        const cavetileTex = this.textures.exists('Cavetile_wall_5LC1') ? 'Cavetile_wall_5LC1' :
                            this.textures.exists('Cavetile_wall_T') ? 'Cavetile_wall_T' : null;
        if (cavetileTex) {
            // 右下：(101, -15) → (139, 30)
            const dec1X = 101 * G;
            const dec1Y = -15 * G;
            const dec1W = (139 - 101 + 1) * G;
            const dec1H = (30 - (-15) + 1) * G;
            const dec1 = this.add.tileSprite(dec1X + dec1W / 2, dec1Y + dec1H / 2, dec1W, dec1H, cavetileTex);
            dec1.setDepth(-5);
            if (this.uiCam) { try { this.uiCam.ignore(dec1); } catch(e) {} }
        }

        // (38,-1) 往右到边界，往上 4 格 — 这是顶部装饰，玩家可走到，保留 wall
        wallRange(38, -4, 139, -1);

        // === level_1777654979306 — 修补 ===
        wallRange(87, 6, 87, 7);
        wallRange(90, 6, 93, 15);
        wallRange(89, 8, 89, 8);
        airBg(89, 9, 89, 9);
        airBg(89, 15, 89, 15);

        // === level_1777716255011 — zone2 内部地形 ===
        // Row 8 全 wall
        wallRange(1, 8, 38, 8);
        // Row 9 全 wall
        wallRange(1, 9, 38, 9);
        // Row 10
        wallRange(1, 10, 8, 10);
        wallRange(31, 10, 38, 10);
        // Row 11
        wallRange(1, 11, 7, 11);
        wallRange(32, 11, 38, 11);
        // Row 12
        wallRange(1, 12, 6, 12);
        wallRange(33, 12, 39, 12);
        // Row 13
        wallRange(1, 13, 5, 13);
        wallRange(34, 13, 40, 13);
        // (1~92, 23~25) 填 cavetile wall
        wallRange(1, 23, 92, 25);

        // === level_1777717223394 — 阶梯地形 ===
        wallRange(0, 14, 5, 14);
        wallRange(6, 13, 6, 13);
        wallRange(7, 12, 7, 12);
        wallRange(8, 11, 8, 11);
        wallRange(9, 10, 9, 10);
        wallRange(30, 10, 30, 10);
        wallRange(31, 11, 31, 11);
        wallRange(32, 12, 32, 12);
        wallRange(33, 13, 33, 13);

        // === level_1777659081310 — 怪物 + 水晶矿 ===
        // 怪物（直接 new，参考 T1 写法）
        // 死亡后随机 1~3 分钟在原位置重生
        // 重生时间到了但玩家不在该 chunk → 等玩家回来才生成
        const pendingRespawns = [];
        this._pendingRespawns = pendingRespawns;
        const scheduleRespawn = (cls, groupName, x, y, homeChunk) => {
            const delay = Phaser.Math.Between(300000, 480000);  // 5~8 分钟
            const readyAt = this.time.now + delay;
            pendingRespawns.push({ cls, groupName, x, y, homeChunk, readyAt });
        };

        const addMon = (m, groupName, classRef, spawnX, spawnY) => {
            const grp = this[groupName];
            if (grp) grp.add(m);
            if (m.setDepth) m.setDepth(10);
            if (this.uiCam) { try { this.uiCam.ignore(m); } catch(e) {} }
            if (groupName === 'bats' && m.body) {
                m.body.setAllowGravity(false);
                m.body.setVelocity(0, 0);
            }
            m._spawnX = spawnX;
            m._spawnY = spawnY;
            m._spawnClass = classRef;
            m._spawnGroupName = groupName;
            const col = m.x / 32, row = m.y / 32;
            let homeChunk = null;
            if (this._chunks) {
                for (const c of this._chunks) {
                    if (col >= c.x1 && col <= c.x2 + 1 && row >= c.y1 && row <= c.y2 + 1) {
                        homeChunk = c;
                        m._homeChunk = c;
                        break;
                    }
                }
            }
            // 监听销毁 → 调度重生
            m.once('destroy', () => {
                scheduleRespawn(classRef, groupName, spawnX, spawnY, homeChunk);
            });
            return m;
        };

        // helper: 创建怪物 at (col, row) + 标记重生信息
        const spawnAt = (cls, groupName, col, row) => {
            const x = col * G + G/2;
            const y = row * G + G/2;
            const m = new cls(this, x, y);
            return addMon(m, groupName, cls, x, y);
        };

        spawnAt(CrystalSlime, 'slimes', 59, 18);
        spawnAt(CrystalSlime, 'slimes', 76, 19);
        spawnAt(CrystalHunterSpider, 'spiders', 72, 11);
        spawnAt(CrystalHunterSpider, 'spiders', 48, 3);
        spawnAt(CrystalHunterSpider, 'spiders', 52, 3);
        spawnAt(CrystalBungeeSpider, 'bungeeSpiders', 84, 4);
        spawnAt(CrystalBungeeSpider, 'bungeeSpiders', 70, 1);
        spawnAt(CrystalBungeeSpider, 'bungeeSpiders', 84, -1);

        // === level_1777739054513 — JSON 标记的怪物 spawn (砍一半) ===
        // VolatileCrystal (3 → 2)
        if (typeof VolatileCrystal !== 'undefined') {
            spawnAt(VolatileCrystal, 'volatileCrystals', 16, -26);
            spawnAt(VolatileCrystal, 'volatileCrystals', 52, -38);
        }
        // CrystalBungeeSpider (8 → 4)
        if (typeof CrystalBungeeSpider !== 'undefined') {
            spawnAt(CrystalBungeeSpider, 'bungeeSpiders', 9, -17);
            spawnAt(CrystalBungeeSpider, 'bungeeSpiders', 22, -15);
            spawnAt(CrystalBungeeSpider, 'bungeeSpiders', 66, -40);
            spawnAt(CrystalBungeeSpider, 'bungeeSpiders', 85, -15);
        }
        // CrystalHunterSpider (5 → 3)
        spawnAt(CrystalHunterSpider, 'spiders', 3, -13);
        spawnAt(CrystalHunterSpider, 'spiders', 40, -8);
        spawnAt(CrystalHunterSpider, 'spiders', 90, -19);
        // CrystalBat (12 → 6) → 全换垂丝蜘蛛
        spawnAt(CrystalBungeeSpider, 'bungeeSpiders', 9, -34);
        spawnAt(CrystalBungeeSpider, 'bungeeSpiders', 20, -14);
        spawnAt(CrystalBungeeSpider, 'bungeeSpiders', 40, -39);
        spawnAt(CrystalBungeeSpider, 'bungeeSpiders', 49, -32);
        spawnAt(CrystalBungeeSpider, 'bungeeSpiders', 66, -23);
        spawnAt(CrystalBungeeSpider, 'bungeeSpiders', 89, -25);
        // HardrockBeetle (4 → 2)
        if (typeof HardrockBeetle !== 'undefined') {
            spawnAt(HardrockBeetle, 'beetles', 9, -6);
            spawnAt(HardrockBeetle, 'beetles', 68, -29);
        }
        // CrystalEarthworm (7 → 3)
        if (typeof CrystalEarthworm !== 'undefined') {
            spawnAt(CrystalEarthworm, 'earthworms', 8, -28);
            spawnAt(CrystalEarthworm, 'earthworms', 47, -9);
            spawnAt(CrystalEarthworm, 'earthworms', 64, -6);
        }
        // CrystalSlime (8 → 4)
        spawnAt(CrystalSlime, 'slimes', 27, -17);
        spawnAt(CrystalSlime, 'slimes', 43, -6);
        spawnAt(CrystalSlime, 'slimes', 73, -33);
        spawnAt(CrystalSlime, 'slimes', 89, -5);

        // 水晶矿
        if (typeof CrystalBlock !== 'undefined') {
            if (!this._crystalOres) this._crystalOres = [];
            const spawnCrystal = (col, row) => {
                const cx = col * G + G / 2;
                const cy = row * G + G / 2;
                const ore = new CrystalBlock(this, cx, cy, { hp: 10, dropCount: 1 });
                this._crystalOres.push(ore);
                if (this.uiCam && ore.sprite) {
                    try { this.uiCam.ignore(ore.sprite); } catch(e) {}
                }
            };
            spawnCrystal(51, 3);
            spawnCrystal(83, 19);
            spawnCrystal(88, 4);
            spawnCrystal(62, 7);
            // === level_1779794362483.json — 主区域地形改动 ===
            // 先清掉 7 个 wall (newType=air)
            airRange(64, 17, 64, 17);
            airRange(66, 17, 66, 17);
            airRange(71, 13, 71, 13);
            airRange(76, 8,  76, 8);
            airRange(79, 15, 79, 15);
            airRange(85, 10, 85, 10);
            airRange(81, 3,  81, 3);
            // 9 个新水晶 (note: (80, 16) JSON 里加了又删, 净无变化, 不加)
            spawnCrystal(57, 12);
            spawnCrystal(70, 19);
            spawnCrystal(89, 14);
            spawnCrystal(80, 4);
            spawnCrystal(65, 1);
            spawnCrystal(56, -1);
            spawnCrystal(44, 0);
            spawnCrystal(74, 9);
            spawnCrystal(82, 15);
        }

        // (32, 13~19) — Mob 透明墙（删除原本 33 列）
        for (let row = 13; row <= 19; row++) {
            new MobWall(this, 32 * G + G/2, row * G + G/2, G, G);
        }

        // Checkpoint 神像 — 5 格高 6 格宽，center 在 col 19~20 中间, row 17 中央
        // x = (19 + 20) / 2 = 19.5 → world x = 19.5 * G + G = 640
        // y = 17 * G + G/2 = 560
        this._checkpoint = new Checkpoint(this, 19.5 * G + G/2, 17 * G + G/2 + G/2);

        // 雕像激活后扩散 yellowdirt 皮肤的标记坐标（来自 level_1777717592899）
        this._yellowDirtMarkedCells = [
            [33, 10], [34, 11], [33, 12], [35, 13], [35, 12], [35, 10], [36, 12], [34, 9], [33, 11],
            [33, 20], [33, 21], [33, 22], [34, 21], [35, 20], [36, 22],
            [6, 9], [5, 9], [6, 10], [5, 11], [6, 12], [5, 13], [6, 13], [4, 14],
            [3, 12], [4, 10], [3, 9], [2, 11], [2, 13], [4, 11],
            [6, 21], [6, 22], [5, 22], [5, 20], [4, 21], [2, 20], [3, 22]
        ];
        if (this.uiCam) {
            try { this.uiCam.ignore(this._checkpoint.sprite); } catch(e) {}
            try { this.uiCam.ignore(this._checkpoint.eIcon); } catch(e) {}
        }

        // === SZ1 商人 (26, 18) — 阶段 9 ===
        if (typeof MoleTrader !== 'undefined') {
            const mtX = 26 * G + G / 2;
            const mtY = 18 * G + G / 2;
            this.moleTrader = new MoleTrader(this, mtX, mtY);
            this._sz1MerchantCutsceneDone = false;
            // 让商人 ↔ walls 不掉出地底
            if (this.walls) this.physics.add.collider(this.moleTrader, this.walls);
            if (this.uiCam) {
                try { this.uiCam.ignore(this.moleTrader); } catch(e) {}
                try { this.uiCam.ignore(this.moleTrader.interactionIcon); } catch(e) {}
            }
            // console.log('[SZ1] MoleTrader placed at (26, 18)');   // (用户) 诊断日志静默
        }

        // === level_1777658002927 — 修补 ===
        // walls
        wallRange(75, -1, 75, -1);
        wallRange(85, -1, 86, -1);
        wallRange(72, 0, 74, 0);
        wallRange(86, 0, 89, 0);
        wallRange(88, 1, 89, 1);
        wallRange(89, 2, 89, 5);
        wallRange(88, 5, 88, 5);
        wallRange(88, 8, 88, 8);
        wallRange(89, 9, 89, 9);
        // bg
        airBg(45, -1, 62, -1);
        airBg(76, -1, 84, -1);
        airBg(44, 0, 44, 0);
        airBg(62, 0, 63, 0);
        // platforms (76-84, -2)
        // 先删除这片 wall（之前的 wallRange(38, -4, 139, -1) 把 row -2 也填了）
        airRange(76, -2, 84, -2);
        // 删 col 76~84 row -50 ~ -3 的 wall（让 platform 上方有空间跳上来）
        airRange(76, -50, 84, -3);
        for (let c = 76; c <= 84; c++) {
            if (typeof PlatformBlock !== 'undefined') {
                const p = new PlatformBlock(this, c * G + G / 2, -2 * G + G / 2, G, G);
                if (p.rect && p.rect.body && p.rect.body.updateFromGameObject) {
                    p.rect.body.updateFromGameObject();
                }
                if (p.rect && p.rect.body) {
                    p.rect.body.checkCollision.down = false;
                    p.rect.body.checkCollision.left = false;
                    p.rect.body.checkCollision.right = false;
                    p.rect.body.checkCollision.up = true;
                }
            }
        }
        // platforms (83-86, 6) — 已删除

        // === 大面积 BG（zone4 区域）— 用真实 BG block 填，确保显示 ===
        // 上方扩 BG: (39, -50) → (93, -1) — 缩到 row -50（够看到 zone4）
        bgRange(39, -50, 93, -1);
        // col 32~92 row -52 ~ -3 往上 50 格 BG
        bgRange(32, -52, 92, -3);
        // 右扩 BG: (90, 0) → (93, 22)
        bgRange(90, 0, 93, 22);

        // (32~38, 1~7) cavetile wall
        wallRange(32, 1, 38, 7);

        // === level_1777734198229 — zone4 地形 ===
        // walls
        wallRange(90, -52, 92, -52);
        wallRange(90, -51, 92, -51);
        wallRange(90, -50, 92, -50);
        wallRange(90, -49, 92, -49);
        wallRange(66, -48, 84, -48);
        wallRange(90, -48, 92, -48);
        wallRange(65, -47, 85, -47);
        wallRange(90, -47, 92, -47);
        wallRange(64, -46, 86, -46);
        wallRange(90, -46, 92, -46);
        wallRange(64, -45, 86, -45);
        wallRange(90, -45, 92, -45);
        wallRange(64, -44, 86, -44);
        wallRange(90, -44, 92, -44);
        wallRange(64, -43, 85, -43);
        wallRange(90, -43, 92, -43);
        wallRange(65, -42, 85, -42);
        wallRange(90, -42, 92, -42);
        wallRange(66, -41, 84, -41);
        wallRange(90, -41, 92, -41);
        wallRange(67, -40, 83, -40);
        wallRange(90, -40, 92, -40);
        wallRange(69, -39, 81, -39);
        wallRange(90, -39, 92, -39);
        wallRange(71, -38, 79, -38);
        wallRange(90, -38, 92, -38);
        wallRange(73, -37, 77, -37);
        wallRange(90, -37, 92, -37);
        wallRange(74, -36, 76, -36);
        wallRange(90, -36, 92, -36);
        wallRange(90, -35, 92, -35);
        wallRange(90, -34, 92, -34);
        wallRange(90, -33, 92, -33);
        wallRange(59, -32, 61, -32);
        wallRange(73, -32, 78, -32);
        wallRange(90, -32, 92, -32);
        wallRange(58, -31, 62, -31);
        wallRange(71, -31, 81, -31);
        wallRange(90, -31, 92, -31);
        wallRange(57, -30, 63, -30);
        wallRange(70, -30, 92, -30);
        wallRange(57, -29, 64, -29);
        wallRange(69, -29, 92, -29);
        wallRange(58, -28, 92, -28);
        wallRange(58, -27, 92, -27);
        wallRange(57, -26, 92, -26);
        wallRange(56, -25, 92, -25);
        wallRange(55, -24, 86, -24);
        wallRange(54, -23, 86, -23);
        wallRange(53, -22, 86, -22);
        wallRange(90, -22, 90, -22);
        wallRange(53, -21, 58, -21);
        wallRange(62, -21, 86, -21);
        wallRange(54, -20, 57, -20);
        wallRange(63, -20, 70, -20);
        wallRange(65, -19, 68, -19);
        wallRange(81, -19, 87, -19);
        wallRange(39, -18, 42, -18);
        wallRange(79, -18, 88, -18);
        wallRange(39, -17, 43, -17);
        wallRange(77, -17, 89, -17);
        wallRange(39, -16, 44, -16);
        wallRange(76, -16, 91, -16);
        wallRange(39, -15, 44, -15);
        wallRange(76, -15, 82, -15);
        wallRange(86, -15, 92, -15);
        wallRange(39, -14, 43, -14);
        wallRange(77, -14, 81, -14);
        wallRange(87, -14, 92, -14);
        wallRange(39, -13, 42, -13);
        wallRange(78, -13, 79, -13);
        wallRange(88, -13, 92, -13);
        wallRange(39, -12, 41, -12);
        wallRange(55, -12, 60, -12);
        wallRange(89, -12, 92, -12);
        wallRange(39, -11, 40, -11);
        wallRange(56, -11, 59, -11);
        wallRange(89, -11, 92, -11);
        wallRange(39, -10, 39, -10);
        wallRange(57, -10, 59, -10);
        wallRange(89, -10, 92, -10);
        wallRange(39, -9, 39, -9);
        wallRange(57, -9, 60, -9);
        wallRange(89, -9, 92, -9);
        wallRange(39, -8, 39, -8);
        wallRange(47, -8, 48, -8);
        wallRange(57, -8, 61, -8);
        wallRange(90, -8, 92, -8);
        wallRange(39, -7, 40, -7);
        wallRange(46, -7, 49, -7);
        wallRange(56, -7, 61, -7);
        wallRange(39, -6, 41, -6);
        wallRange(45, -6, 50, -6);
        wallRange(55, -6, 62, -6);
        wallRange(39, -5, 73, -5);
        // air 挖洞
        airRange(87, -42, 87, -42);
        airRange(87, -38, 87, -38);
        airRange(87, -34, 87, -34);
        airRange(89, -33, 89, -33);
        airRange(88, -32, 89, -32);
        airRange(84, -31, 89, -31);
        airRange(62, -20, 62, -20);
        airRange(76, -17, 76, -17);
        airRange(45, -16, 45, -16);
        airRange(66, -16, 70, -16);
        airRange(49, -15, 49, -15);
        airRange(75, -15, 75, -15);
        airRange(76, -14, 76, -14);
        airRange(75, -4, 75, -4);
        airRange(85, -4, 85, -4);
        // platforms (4 行)
        const _zone4Plats = [
            { y: -46, c1: 87, c2: 89 },
            { y: -42, c1: 88, c2: 89 },
            { y: -38, c1: 88, c2: 89 },
            { y: -34, c1: 88, c2: 89 },
        ];
        _zone4Plats.forEach(p => {
            for (let c = p.c1; c <= p.c2; c++) {
                if (typeof PlatformBlock !== 'undefined') {
                    const pb = new PlatformBlock(this, c * G + G/2, p.y * G + G/2, G, G);
                    if (pb.rect && pb.rect.body) {
                        pb.rect.body.checkCollision.down = false;
                        pb.rect.body.checkCollision.left = false;
                        pb.rect.body.checkCollision.right = false;
                        pb.rect.body.checkCollision.up = true;
                        if (pb.rect.body.updateFromGameObject) pb.rect.body.updateFromGameObject();
                    }
                }
            }
        });
        // 水晶矿
        if (typeof CrystalBlock !== 'undefined') {
            if (!this._crystalOres) this._crystalOres = [];
            const _spawnCrystalZone4 = (col, row) => {
                const ore = new CrystalBlock(this, col * G + G/2, row * G + G/2, { hp: 10, dropCount: 1 });
                this._crystalOres.push(ore);
                if (this.uiCam && ore.sprite) {
                    try { this.uiCam.ignore(ore.sprite); } catch(e) {}
                }
            };
            _spawnCrystalZone4(41, -7);
            _spawnCrystalZone4(44, -6);
            _spawnCrystalZone4(54, -6);
            _spawnCrystalZone4(49, -8);
        }
        // KeyDoor (col 91, row -5 ~ -7) — 3 格高 — 用 _keyDoor 让 InteractSystem 接管 + flipX
        if (typeof KeyDoor !== 'undefined') {
            this._keyDoor = new KeyDoor(
                this,
                91 * G + G/2,
                (-7 + -5 + 1) / 2 * G,
                G,
                3 * G,
                { flipX: true }
            );
            // console.log('[SZ1] KeyDoor created at (', this._keyDoor.x, ',', this._keyDoor.y, ') opened=', this._keyDoor.opened);   // (用户) 诊断日志静默
        }
        // 单独 wall (92, -7) — KeyDoor 旁的装饰墙
        wallRange(92, -7, 92, -7);
        // CrystalDoor (col 75, row -35 ~ -33) — 3 格高 — 10 水晶开门 (用户: 原 20 → 10)
        if (typeof CrystalDoor !== 'undefined') {
            this._crystalDoor = new CrystalDoor(
                this,
                75 * G + G/2,
                (-35 + -33 + 1) / 2 * G,
                G,
                3 * G,
                10,   // (用户) 开门花费 20 → 10
                { flipX: true }
            );
            // console.log('[SZ1] CrystalDoor created at (', this._crystalDoor.x, ',', this._crystalDoor.y, ') opened=', this._crystalDoor.opened, 'body=', !!this._crystalDoor.rect.body);   // (用户) 诊断日志静默
        }

        // === level_1777737194034 — zone4/zone5 地形扩展 ===
        // walls (80 runs)
        wallRange(-6, -36, 25, -36);
        wallRange(-6, -35, 25, -35);
        wallRange(-7, -34, 7, -34);
        wallRange(-7, -33, -2, -33);
        wallRange(1, -33, 5, -33);
        wallRange(-7, -32, -3, -32);
        wallRange(2, -32, 4, -32);
        wallRange(-7, -31, -3, -31);
        wallRange(3, -31, 3, -31);
        wallRange(-7, -30, -4, -30);
        wallRange(-7, -29, -4, -29);
        wallRange(-7, -28, -4, -28);
        wallRange(-7, -27, -4, -27);
        wallRange(7, -27, 13, -27);
        wallRange(-7, -26, -3, -26);
        wallRange(7, -26, 14, -26);
        wallRange(-7, -25, -3, -25);
        wallRange(7, -25, 17, -25);
        wallRange(-7, -24, -3, -24);
        wallRange(6, -24, 18, -24);
        wallRange(91, -24, 92, -24);
        wallRange(-7, -23, -2, -23);
        wallRange(5, -23, 19, -23);
        wallRange(69, -23, 70, -23);
        wallRange(92, -23, 92, -23);
        wallRange(-7, -22, 19, -22);
        wallRange(92, -22, 92, -22);
        wallRange(-7, -21, 19, -21);
        wallRange(92, -21, 92, -21);
        wallRange(-7, -20, 20, -20);
        wallRange(92, -20, 92, -20);
        wallRange(-7, -19, 21, -19);
        wallRange(91, -19, 92, -19);
        wallRange(-7, -18, 1, -18);
        wallRange(5, -18, 9, -18);
        wallRange(13, -18, 22, -18);
        wallRange(29, -18, 38, -18);
        wallRange(89, -18, 92, -18);
        wallRange(-7, -17, 0, -17);
        wallRange(7, -17, 8, -17);
        wallRange(14, -17, 22, -17);
        wallRange(28, -17, 38, -17);
        wallRange(90, -17, 92, -17);
        wallRange(-7, -16, -1, -16);
        wallRange(15, -16, 22, -16);
        wallRange(27, -16, 38, -16);
        wallRange(92, -16, 92, -16);
        wallRange(-7, -15, -1, -15);
        wallRange(16, -15, 21, -15);
        wallRange(27, -15, 38, -15);
        wallRange(-7, -14, 0, -14);
        wallRange(17, -14, 19, -14);
        wallRange(27, -14, 38, -14);
        wallRange(-7, -13, 2, -13);
        wallRange(27, -13, 38, -13);
        wallRange(56, -13, 60, -13);
        wallRange(80, -13, 80, -13);
        wallRange(-7, -12, 5, -12);
        wallRange(27, -12, 38, -12);
        wallRange(-7, -11, 7, -11);
        wallRange(28, -11, 38, -11);
        wallRange(-7, -10, 6, -10);
        wallRange(29, -10, 38, -10);
        wallRange(60, -10, 60, -10);
        wallRange(-7, -9, 5, -9);
        wallRange(30, -9, 38, -9);
        wallRange(61, -9, 61, -9);
        wallRange(-7, -8, 5, -8);
        wallRange(17, -8, 20, -8);
        wallRange(30, -8, 38, -8);
        wallRange(-7, -7, 5, -7);
        wallRange(16, -7, 21, -7);
        wallRange(29, -7, 38, -7);
        wallRange(-7, -6, 6, -6);
        wallRange(15, -6, 22, -6);
        wallRange(28, -6, 38, -6);
        wallRange(-7, -5, -1, -5);
        wallRange(-7, -4, -1, -4);
        wallRange(-7, -3, -1, -3);
        wallRange(-7, -2, -1, -2);
        // air 挖洞 (25 runs)
        airRange(57, -29, 57, -29);
        airRange(6, -26, 6, -26);
        airRange(5, -25, 6, -25);
        airRange(18, -25, 20, -25);
        airRange(78, -25, 89, -25);
        airRange(4, -24, 5, -24);
        airRange(19, -24, 20, -24);
        airRange(77, -24, 86, -24);
        airRange(3, -23, 4, -23);
        airRange(64, -23, 68, -23);
        airRange(76, -23, 86, -23);
        airRange(61, -22, 71, -22);
        airRange(75, -22, 86, -22);
        airRange(90, -22, 90, -22);
        airRange(62, -21, 86, -21);
        airRange(32, -20, 36, -20);
        airRange(63, -20, 70, -20);
        airRange(30, -19, 37, -19);
        airRange(65, -19, 68, -19);
        airRange(87, -19, 87, -19);
        airRange(89, -19, 90, -19);
        airRange(24, -17, 24, -17);
        airRange(54, -13, 55, -13);
        airRange(60, -12, 60, -12);
        airRange(92, -7, 92, -7);
        // bg (22 runs)
        bgRange(2, -18, 4, -18);
        bgRange(10, -18, 12, -18);
        bgRange(1, -17, 6, -17);
        bgRange(9, -17, 13, -17);
        bgRange(0, -16, 14, -16);
        bgRange(0, -15, 15, -15);
        bgRange(22, -15, 26, -15);
        bgRange(1, -14, 16, -14);
        bgRange(20, -14, 26, -14);
        bgRange(3, -13, 26, -13);
        bgRange(6, -12, 25, -12);
        bgRange(8, -11, 27, -11);
        bgRange(7, -10, 28, -10);
        bgRange(6, -9, 29, -9);
        bgRange(6, -8, 16, -8);
        bgRange(21, -8, 29, -8);
        bgRange(6, -7, 15, -7);
        bgRange(22, -7, 28, -7);
        bgRange(7, -6, 14, -6);
        bgRange(23, -6, 27, -6);
        bgRange(8, -5, 13, -5);
        bgRange(24, -5, 26, -5);
        // platforms (2 runs)
        const _zone5Plats = [
            { y: -16, c1: 23, c2: 26 },
            { y: -12, c1: 26, c2: 26 },
        ];
        _zone5Plats.forEach(p => {
            for (let c = p.c1; c <= p.c2; c++) {
                if (typeof PlatformBlock !== 'undefined') {
                    const pb = new PlatformBlock(this, c * G + G/2, p.y * G + G/2, G, G);
                    if (pb.rect && pb.rect.body) {
                        pb.rect.body.checkCollision.down = false;
                        pb.rect.body.checkCollision.left = false;
                        pb.rect.body.checkCollision.right = false;
                        pb.rect.body.checkCollision.up = true;
                        if (pb.rect.body.updateFromGameObject) pb.rect.body.updateFromGameObject();
                    }
                }
            }
        });
        // crystals (2)
        if (typeof CrystalBlock !== 'undefined') {
            if (!this._crystalOres) this._crystalOres = [];
            const _spawnCrystalZone5 = (col, row) => {
                const ore = new CrystalBlock(this, col * G + G/2, row * G + G/2, { hp: 10, dropCount: 1 });
                this._crystalOres.push(ore);
                if (this.uiCam && ore.sprite) {
                    try { this.uiCam.ignore(ore.sprite); } catch(e) {}
                }
            };
            _spawnCrystalZone5(88, -19);
            _spawnCrystalZone5(91, -20);
        }

        // === level_1777737792323 — zone5 上方阶梯地形 ===
        // zone5 范围全填 bg (-6, -36) → (36, -2)
        bgRange(-6, -36, 36, -2);
        // walls (13)
        wallRange(-7, -37, 36, -37);
        wallRange(-7, -36, -7, -36);
        wallRange(26, -36, 36, -36);
        wallRange(-7, -35, -7, -35);
        wallRange(26, -35, 36, -35);
        wallRange(20, -34, 36, -34);
        wallRange(23, -33, 36, -33);
        wallRange(25, -32, 36, -32);
        wallRange(27, -31, 36, -31);
        wallRange(29, -30, 36, -30);
        wallRange(31, -29, 36, -29);
        wallRange(33, -28, 36, -28);
        wallRange(35, -27, 36, -27);
        // air 挖洞 (5)
        airRange(10, -38, 11, -38);
        airRange(20, -30, 20, -30);
        airRange(1, -29, 1, -29);
        airRange(31, -25, 31, -25);
        airRange(33, -22, 33, -22);

        // === level_1777739054513 — zone6 阶梯 + 散布水晶 ===
        // walls (25)
        wallRange(36, -46, 50, -46);
        wallRange(36, -45, 49, -45);
        wallRange(36, -44, 48, -44);
        wallRange(36, -43, 46, -43);
        wallRange(36, -42, 44, -42);
        wallRange(36, -41, 42, -41);
        wallRange(36, -40, 40, -40);
        wallRange(36, -39, 39, -39);
        wallRange(36, -38, 39, -38);
        wallRange(47, -38, 51, -38);
        wallRange(37, -37, 38, -37);
        wallRange(46, -37, 52, -37);
        wallRange(37, -36, 38, -36);
        wallRange(46, -36, 53, -36);
        wallRange(37, -35, 38, -35);
        wallRange(46, -35, 53, -35);
        wallRange(37, -34, 38, -34);
        wallRange(47, -34, 52, -34);
        wallRange(37, -33, 39, -33);
        wallRange(48, -33, 51, -33);
        wallRange(37, -32, 39, -32);
        wallRange(37, -31, 39, -31);
        wallRange(37, -30, 39, -30);
        wallRange(37, -29, 38, -29);
        wallRange(37, -28, 37, -28);
        // air (7)
        airRange(45, -37, 45, -37);
        airRange(53, -37, 53, -37);
        // [removed] airRange(75, -34, 75, -34) — 这行会 destroy CrystalDoor (line 1437) 的 rect
        // 因为 door rect 中心 y=-1072 → Math.floor(-1072/32)=-34, 被 airRange 误判为 (75,-34) 的墙
        // 玩家因此能穿过去（image 还在，body 没了）。cell 本来就是 air, 这行多余。
        airRange(45, -33, 45, -33);
        airRange(45, -29, 45, -29);
        airRange(42, -26, 42, -26);
        airRange(42, -22, 42, -22);
        // crystals — auto-detect rotation based on adjacent walls
        if (typeof CrystalBlock !== 'undefined') {
            if (!this._crystalOres) this._crystalOres = [];

            // helper: check if world cell (col, row) has a WALL (not BLOCK)
            const _hasWallAt = (col, row) => {
                const gs = this.gridSystem;
                if (!gs) return false;
                const gridCol = col - gs.originX / G;
                const gridRow = row - gs.originY / G;
                return gs.getType(gridCol, gridRow) === GridSystem.WALL;
            };
            // 旋转判定: 优先地面 (0°), 没下方就左墙 (90°), 再右墙 (270°), 最后天花板 (180°)
            const _detectRotation = (col, row) => {
                if (_hasWallAt(col, row + 1)) return 0;                  // 下方有 → 直立
                if (_hasWallAt(col - 1, row)) return Math.PI / 2;        // 左墙 → 顺时针 90°
                if (_hasWallAt(col + 1, row)) return 3 * Math.PI / 2;    // 右墙 → 顺时针 270°
                if (_hasWallAt(col, row - 1)) return Math.PI;            // 天花板 → 顺时针 180°
                return 0;                                                 // fallback
            };

            const _spawnCrystalZone6 = (col, row) => {
                const rotation = _detectRotation(col, row);
                const ore = new CrystalBlock(this, col * G + G/2, row * G + G/2, { hp: 10, dropCount: 1, rotation });
                this._crystalOres.push(ore);
                if (this.uiCam && ore.sprite) {
                    try { this.uiCam.ignore(ore.sprite); } catch(e) {}
                }
            };
            _spawnCrystalZone6(-2, -24);
            // (1, -23) 移除 — 改成 chest
            _spawnCrystalZone6(1, -14);
            _spawnCrystalZone6(6, -25);
            _spawnCrystalZone6(7, -6);
            _spawnCrystalZone6(11, -6);
            _spawnCrystalZone6(15, -26);
            _spawnCrystalZone6(15, -7);
            _spawnCrystalZone6(21, -8);
            _spawnCrystalZone6(25, -6);
            _spawnCrystalZone6(28, -7);
            _spawnCrystalZone6(39, -34);
            _spawnCrystalZone6(39, -19);
            _spawnCrystalZone6(48, -39);
            _spawnCrystalZone6(55, -25);
            _spawnCrystalZone6(65, -6);
            _spawnCrystalZone6(67, -29);
            _spawnCrystalZone6(71, -32);
            _spawnCrystalZone6(83, -31);
            _spawnCrystalZone6(86, -31);
            _spawnCrystalZone6(88, -5);
            // === level_1779789581247.json — 44 个额外水晶 ===
            const _jsonCrystals = [
                [47, -55], [50, -53], [57, -52], [70, -52], [76, -51], [81, -49],
                [49, -61], [59, -62], [69, -61], [76, -62], [83, -59], [89, -54],
                [85, -41], [81, -38], [67, -39], [63, -44], [55, -45], [44, -41],
                [40, -30], [57, -29], [46, -34], [51, -32],
                [43, -13], [56, -10], [59, -21], [66, -23], [74, -21],
                [81, -25], [87, -25], [80, -19], [39, -19],
                [20, -22], [31, -28], [23, -32], [14, -34], [5, -32], [-2, -31],
                [4, -18], [12, -18], [16, -14], [6, -9],
                [88, -11], [84, -15], [79, -12]
            ];
            _jsonCrystals.forEach(([c, r]) => _spawnCrystalZone6(c, r));

            // === 3 个宝箱 (SZ1 zone6) — (1, -23) 替代原水晶, (49, -39), (64, -52) ===
            if (typeof Chest !== 'undefined') {
                const _chestSpots = [[1, -23], [49, -39], [64, -52]];
                _chestSpots.forEach(([c, r]) => {
                    new Chest(this, c, r);
                });
                // console.log('[SZ1] 3 chests placed at', _chestSpots);   // (用户) 诊断日志静默
            }
        }

        // === level_1777858207168 — zone6 上方深处地形 ===
        // walls (34)
        wallRange(40, -65, 92, -65);
        wallRange(40, -64, 92, -64);
        wallRange(40, -63, 70, -63);
        wallRange(76, -63, 92, -63);
        wallRange(40, -62, 57, -62);
        wallRange(64, -62, 69, -62);
        wallRange(77, -62, 92, -62);
        wallRange(40, -61, 48, -61);
        wallRange(53, -61, 56, -61);
        wallRange(66, -61, 67, -61);
        wallRange(78, -61, 92, -61);
        wallRange(40, -60, 47, -60);
        wallRange(79, -60, 92, -60);
        wallRange(40, -59, 46, -59);
        wallRange(86, -59, 92, -59);
        wallRange(40, -58, 45, -58);
        wallRange(87, -58, 92, -58);
        wallRange(40, -57, 45, -57);
        wallRange(88, -57, 92, -57);
        wallRange(40, -56, 45, -56);
        wallRange(89, -56, 92, -56);
        wallRange(40, -55, 46, -55);
        wallRange(90, -55, 92, -55);
        wallRange(40, -54, 47, -54);
        wallRange(90, -54, 92, -54);
        wallRange(40, -53, 48, -53);
        wallRange(90, -53, 92, -53);
        wallRange(40, -52, 52, -52);
        wallRange(40, -51, 75, -51);
        wallRange(40, -50, 76, -50);
        wallRange(40, -49, 77, -49);
        wallRange(40, -48, 65, -48);
        wallRange(40, -47, 64, -47);
        wallRange(51, -46, 63, -46);
        // bg (14)
        bgRange(71, -63, 75, -63);
        bgRange(58, -62, 63, -62);
        bgRange(70, -62, 76, -62);
        bgRange(49, -61, 52, -61);
        bgRange(57, -61, 65, -61);
        bgRange(68, -61, 77, -61);
        bgRange(48, -60, 78, -60);
        bgRange(47, -59, 85, -59);
        bgRange(46, -58, 86, -58);
        bgRange(46, -57, 87, -57);
        bgRange(46, -56, 88, -56);
        bgRange(47, -55, 89, -55);
        bgRange(48, -54, 89, -54);
        bgRange(49, -53, 89, -53);

        // (93, -65 ~ 0) cavetile 一列
        wallRange(93, -65, 93, 0);

        // ============= Corpse 装饰 × 4 (depth 10, 低于 hint/玩家, 高于神像) =============
        if (typeof Corpse !== 'undefined') {
            new Corpse(this, 2, -14, 'corpse3');     // hint 1 位置
            new Corpse(this, 54, -52, 'corpse2');    // hint 2 位置
            new Corpse(this, 89, -19, 'corpse1', { yOffset: 15 });    // hint 3 位置 — 下移 15
            new Corpse(this, 46, 3, 'corpse2');      // hint 4 位置
        }

        // ============= Hint 提示 × 3 =============
        if (typeof Hint !== 'undefined') {
            // Hint 1 (2, -14) — 字条
            new Hint(this, 2, -14, {
                onInteract: () => {
                    if (this.dialogSystem) {
                        this.dialogSystem.show({
                            speaker: '???',
                            text: 'There is a note here, seemingly from one who came before:\n"I want to leave this place. This is hell..."'
                        });
                    }
                }
            });

            // Hint 2 (54, -52) — 书 (是/否 → 是 → 给 key)
            this._sz1Hint2_keyGiven = false;
            new Hint(this, 54, -52, {
                onInteract: (firstTime) => {
                    if (this.dialogSystem) {
                        this.dialogSystem.show({
                            speaker: '???',
                            text: 'There is a book here. Open it?',
                            choices: [
                                {
                                    label: 'Yes',
                                    action: () => {
                                        const lines = [{ speaker: '???', text: '"We should not have been so greedy..."' }];
                                        if (!this._sz1Hint2_keyGiven) {
                                            this._sz1Hint2_keyGiven = true;
                                            lines.push({ speaker: '???', text: 'Something seems tucked in the book... Mysterious Key +1' });
                                            if (this.inventorySystem && this.inventorySystem.addItem) {
                                                this.inventorySystem.addItem('key', 1);
                                            }
                                        }
                                        if (this.dialogSystem && this.dialogSystem.showSequence) {
                                            this.dialogSystem.showSequence(lines);
                                        } else if (this.dialogSystem) {
                                            this.dialogSystem.show(lines[0]);
                                        }
                                    }
                                },
                                {
                                    label: 'No',
                                    action: () => {
                                        if (this.dialogSystem && this.dialogSystem.close) this.dialogSystem.close();
                                    }
                                }
                            ]
                        });
                    }
                }
            });

            // Hint 3 (89, -20) — 远离蓝水晶 — 下移 15
            new Hint(this, 89, -20, {
                achId: 'sz1_hidden',   // (用户成就) 隐秘地点
                yOffset: 15,
                onInteract: () => {
                    if (this.dialogSystem) {
                        this.dialogSystem.show({
                            speaker: '???',
                            text: 'Stay away... from the blue crystal...'
                        });
                    }
                }
            });

            // Hint 4 (46, 3) — 前任的留言
            new Hint(this, 46, 3, {
                onInteract: () => {
                    if (this.dialogSystem) {
                        this.dialogSystem.show({
                            speaker: '???',
                            text: 'There is a message from a predecessor:\n"This should not exist, but should be destroyed..."'
                        });
                    }
                }
            });
        }

        // === level_1779690659516 — bg_block 装饰 (出生区, 66 cell) ===
        // (用户重新加回这块装饰; 其他原本的 bg helper 仍为 no-op)
        const bgCells = [
            // row 12
            [-26,12], [-25,12], [-24,12], [-23,12],
            // row 13
            [-27,13], [-26,13], [-25,13], [-24,13], [-23,13], [-22,13],
            // row 14
            [-28,14], [-27,14], [-26,14], [-25,14], [-24,14], [-23,14], [-22,14], [-21,14],
            // row 15
            [-28,15], [-27,15], [-26,15], [-25,15], [-24,15], [-23,15], [-22,15], [-21,15], [-20,15],
            // row 16
            [-28,16], [-27,16], [-26,16], [-25,16], [-24,16], [-23,16], [-22,16], [-21,16], [-20,16],
            // row 17
            [-28,17], [-27,17], [-26,17], [-25,17], [-24,17], [-23,17], [-22,17], [-21,17], [-20,17], [-19,17],
            // row 18
            [-28,18], [-27,18], [-26,18], [-25,18], [-24,18], [-23,18], [-22,18], [-21,18], [-20,18], [-19,18],
            // row 19
            [-27,19], [-26,19], [-25,19], [-24,19], [-23,19], [-22,19], [-21,19], [-20,19], [-19,19], [-18,19]
        ];
        bgCells.forEach(([c, r]) => new BackgroundBlock(this, c * G + G / 2, r * G + G / 2, G, G));

        // === SecretDoor 装饰 ===
        if (typeof SecretDoor !== 'undefined') {
            const door = new SecretDoor(this, -25 * G + G / 2 + G / 2, 18 * G + G / 2, { pairId: 'safezone1_decoration' });
            if (door.eIcon) { door.eIcon.destroy(); door.eIcon = null; }
        }
    }
}