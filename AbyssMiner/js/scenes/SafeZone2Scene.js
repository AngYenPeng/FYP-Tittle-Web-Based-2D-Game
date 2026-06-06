/**
 * SafeZone2Scene — 1 号安全区
 * 玩家通过 Tutorial SecretDoor 进入这里
 * 场景大小 = 屏幕可视范围（zoom 1.25 下：1280×720）
 * 继承 Tutorial 的物品/背包/水晶等状态
 */
class SafeZone2Scene extends MainGameScene {

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
        Phaser.Scene.call(this, { key: 'SafeZone2Scene' });
    }

    init(data) {
        // 接收上一个场景传来的状态（由 SecretDoor 传入）
        this._inheritedData = data || {};
    }

    preload() {
        if (typeof super.preload === 'function') super.preload();
        // (用户) SZ2 3 层背景 4416×2720
        this.load.image('sz2_bg_L1', 'assets/images/sz2_bg_L1.png');
        this.load.image('sz2_bg_L2', 'assets/images/sz2_bg_L2.png');
        this.load.image('sz2_bg_L3', 'assets/images/sz2_bg_L3.png');
    }

    create() {
        if (typeof AudioSystem !== 'undefined') AudioSystem.bgm(this, 'bgm_SafeZone2');  // BGM

        // pickaxeUpgraded — 从 registry 读 (跨场景有效, 刷新网页自动重置 — 暂无后台存档)
        this._pickaxeUpgraded = !!this.registry.get('pickaxeUpgraded');
        // (用户修复) 场景重启实例属性残留预防 (同 SZ4): boss 战旗标/墙引用清零
        this._sz2BossFightStarted = false; this._sz2BossWallsBuilt = false; this._sz2WasInZone2 = false;
        this._sz2MerchantRiseTriggered = false;
        this._sz2MonsterWallLeft = null; this._sz2MonsterWallRight = null;
        this._sz2BossDoorLeft = null; this._sz2BossDoorRight = null;
        // 丢稿子距离极限 (砍短, 防飞出屏幕) — 这里覆盖一次, 不依赖 GameScene.js 构造器
        this.WARNING_DISTANCE = 280; this.HEAVY_FLY_LIMIT = 214; this.CRITICAL_DISTANCE = 380;
        // 节点末索引 (15 节点 → 0..14)
        this.activeEnd1 = 14; this.activeEnd2 = 14;
        // 注册怪物 anim — SZ 场景不调 super.create(), 必须自己 register
        this._registerMonsterAnims();
        this._registerGolemAnims();

        const G = 32;
        const W = 1280;
        const H = 720;

        this.physics.world.setBounds(0, 0, W, H);

        // === SZ2 3 层背景 (SZ1 同款管线: 原生尺寸 4416×2720, 不缩放) ===
        // L1/L3 贴世界 1:1 (sf 1,1); 只有 L2 会动: X 视差 0.5, Y 1:1; L2 跟 SZ1 同款左移 20 格
        // depth: L1 最前 (-101), L2 中 (-102), L3 最深 (-103); 初始锚点 = 基础地图中心 (640, 360), 待按格微调
        {
            const bgX = 640 + 17 * 32, bgY = 360 - 11 * 32;   // (用户) 净偏移: 右 17, 上 11 → (1184, 8)
            if (this.textures.exists('sz2_bg_L3')) {
                this.bgL3 = this.add.image(bgX, bgY, 'sz2_bg_L3').setScrollFactor(1, 1).setDepth(-103);
            }
            if (this.textures.exists('sz2_bg_L2')) {
                this.bgL2 = this.add.image(bgX - 20 * 32, bgY, 'sz2_bg_L2').setScrollFactor(0.5, 1).setDepth(-102);
            }
            if (this.textures.exists('sz2_bg_L1')) {
                this.bgL1 = this.add.image(bgX, bgY, 'sz2_bg_L1').setScrollFactor(1, 1).setDepth(-101);
            }
        }

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
            // (用户) SZ2 BackgroundBlock 全部清空不要了 — 保留空函数, 调用点自然失效
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

        // 物理边界扩展到包含全部扩展区（右 +50 格 + 上 +100 格 + 下 +30 格 = 用户要求）
        this.physics.world.setBounds(
            -BUF_L * G, -100 * G,
            W + (BUF_L + BUF_R + 50) * G, H + (100 + BUF_B + 30) * G
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

        // === 永久怪物空气墙 — boss 房 (zone2) 左右边界 ===
        // 跟玩家空气墙同坐标, 但对玩家不生效, 只对怪物生效
        // 一直存在 — 不因玩家死亡 / boss 死亡 / 剧情结束而销毁 (永久封锁怪物出入 boss 房)
        {
            const G = 32;
            // 左墙: col 7-8, row 12-19 (2 格宽 × 8 格高)
            this._sz2MonsterWallLeft = this.add.rectangle(7 * G + G, 12 * G + 4 * G, 2 * G, 8 * G, 0x000000, 0);
            this.physics.add.existing(this._sz2MonsterWallLeft, true);
            // 右墙: col 32-33, row 13-19 (2 格宽 × 7 格高)
            this._sz2MonsterWallRight = this.add.rectangle(33 * G, 13 * G + 3.5 * G, 2 * G, 7 * G, 0x000000, 0);
            this.physics.add.existing(this._sz2MonsterWallRight, true);

            if (this.uiCam) {
                try { this.uiCam.ignore([this._sz2MonsterWallLeft, this._sz2MonsterWallRight]); } catch(e) {}
            }

            // 所有怪物群 vs 这两堵墙 — collider 跟着 scene 生命周期, 不会消失
            const monsterGroups = [
                this.spiders, this.bats, this.slimes, this.beetles, this.earthworms,
                this.mimicOres, this.bungeeSpiders, this.volatileCrystals
            ];
            monsterGroups.forEach(g => {
                if (g) {
                    this.physics.add.collider(g, this._sz2MonsterWallLeft);
                    this.physics.add.collider(g, this._sz2MonsterWallRight);
                }
            });
        }

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
                // (用户) 防穿模 v2 — 与 GameScene 同源:
                if (this.wallRects) {
                    // ① 落点 X 若伸进同高度侧墙体内 → 先水平挤出 (水晶半宽 10)
                    for (const w of this.wallRects) {
                        if (w.bottom > my - 14 && w.top < my + 14 && targetX > w.left - 10 && targetX < w.right + 10) {
                            targetX = (mx <= (w.left + w.right) / 2) ? w.left - 10 : w.right + 10;
                        }
                    }
                    // ② 垂直 raycast 找地板, 钉地板顶 (半高 10 + 2px 余量)
                    let nearestFloorY = Infinity;
                    for (const w of this.wallRects) {
                        if (targetX >= w.left && targetX <= w.right && w.top >= my - 4) {
                            if (w.top < nearestFloorY) nearestFloorY = w.top;
                        }
                    }
                    if (nearestFloorY === Infinity) {
                        targetX = mx; targetY = my;   // 该 X 列没地板 → 回方块原位
                    } else {
                        targetY = nearestFloorY - 12;
                    }
                    // ③ 最终保险: 仍与任何墙重叠 → 回方块原位 (刚打掉的格子必为空气)
                    for (const w of this.wallRects) {
                        if (targetX > w.left - 10 && targetX < w.right + 10 && targetY > w.top - 10 && targetY < w.bottom + 10) {
                            targetX = mx; targetY = my; break;
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
        // 9 个 chunks (zone7 跟 6/8/9 一排在上方)
        this._chunks = [
            // 出生 + boss (保留)
            { id: 'zone1', x1: -26,  y1: 9,    x2: 8.5,  y2: 22 },
            { id: 'zone2', x1: 8.5,  y1: 9,    x2: 31.5, y2: 22 },
            // zone3 - boss 房右边入口
            { id: 'zone3', x1: 32,   y1: 9,    x2: 55,   y2: 22 },
            // zone4 - zone3 下方 (左边界 +5 格)
            { id: 'zone4', x1: 32,   y1: 20,   x2: 56,   y2: 36 },
            // zone5 - 右下大块
            { id: 'zone5', x1: 56,   y1: 9,    x2: 89,   y2: 42 },
            // zone6 - 上方右半 (合并了原 zone6 + zone7)
            { id: 'zone6', x1: 56,   y1: -32,  x2: 104,  y2: 9  },
            // zone8 - 上中
            { id: 'zone8', x1: 5,    y1: -36,  x2: 56,   y2: 9  },
            // zone9 - 上左
            { id: 'zone9', x1: -32,  y1: -41,  x2: 5,    y2: 9  }
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

        // 强制 mainCam ignore crosshair（防止 cameraSystem 顺序问题导致双鼠标）
        try {
            this.cameras.main.ignore(this.crosshair);
            this.cameras.main.ignore(this.leftHandIndicator);
            this.cameras.main.ignore(this.rightHandIndicator);
        } catch(e) {}

        // 继承 Tutorial 状态
        // 全部 wall 加载完后, 重新检测每个 crystal 的旋转
        if (this._crystalOres) {
            this._crystalOres.forEach(ore => {
                if (ore && ore.redetectRotation) ore.redetectRotation();
            });
        }

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
        // (用户) 一次性剧情完成标志随档恢复 — 防止已读剧情重播/触发器卡死玩家
        if (data.plotFlags) { try { for (const k in data.plotFlags) { if (data.plotFlags[k] === true) this[k] = true; } } catch (e) {} }
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
        // 健康侦测仪 flag + 激活腐蚀度条
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
            const total = this.textures.get('Mimic_ore_run').frameTotal - 2;
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

        // Hint + Chest + CrystalNpc update (阶段 1+2+7)
        if (this._hints) this._hints.forEach(h => h.update());
        if (this._chests) this._chests.forEach(c => c.update());
        if (this._crystalNpcs) this._crystalNpcs.forEach(n => n.update());

        // === Boss intro cinematic + 房间空气墙触发 (玩家镜头切到 zone2 时) ===
        const _inZone2Now = (this._currentChunkId === 'zone2');
        // (用户) 边沿触发: 只在"房外→zone2"的瞬间建墙 (旧版是"只要在 zone2 就建" —
        //   死亡期间和上面拆墙块每帧互搏, 还每帧重复注册稿子阻挡器; 复活点若在 zone2 内会秒重建)
        if (!this._sz2BossWallsBuilt && !this._golemDead && this._golem && !this.isDead &&
            _inZone2Now && !this._sz2WasInZone2) {
            this._sz2BossWallsBuilt = true;
            const G = 32;
            // 左墙: col 7-8, row 12-19 (2 格宽 × 8 格高), 不可见
            this._sz2WallLeft = this.add.rectangle(7 * G + G, 12 * G + 4 * G, 2 * G, 8 * G, 0x000000, 0);
            this.physics.add.existing(this._sz2WallLeft, true);
            this.physics.add.collider(this.player, this._sz2WallLeft);
            // 右墙: col 32-33, row 13-19 (2 格宽 × 7 格高), 不可见 — 用户要求往右加厚 1 格
            this._sz2WallRight = this.add.rectangle(33 * G, 13 * G + 3.5 * G, 2 * G, 7 * G, 0x000000, 0);
            this.physics.add.existing(this._sz2WallRight, true);
            this.physics.add.collider(this.player, this._sz2WallRight);
            // (用户) 挡玩家的空气墙同样挡稿子 (进 CCD 扫掠列表)
            this._registerPickBlocker(this._sz2WallLeft); this._registerPickBlocker(this._sz2WallRight);
            if (this.uiCam) {
                try { this.uiCam.ignore([this._sz2WallLeft, this._sz2WallRight]); } catch(e) {}
            }
            // 启动 boss 进场 cinematic (只第一次会真正跑，_bossIntroStarted 拦截重复)
            this._startBossIntro();
        }

        // 玩家死后清掉 boss 房空气墙 (复活后要等"重新走进 zone2"那一瞬才重建)
        if (this.isDead && this._sz2BossWallsBuilt && !this._golemDead) {
            if (this._sz2WallLeft) { this._sz2WallLeft.destroy(); this._sz2WallLeft = null; }
            if (this._sz2WallRight) { this._sz2WallRight.destroy(); this._sz2WallRight = null; }
            this._sz2BossWallsBuilt = false;
        }
        if (!this.isDead) this._sz2WasInZone2 = _inZone2Now;   // (用户) 死亡期间冻结追踪, 复活在房内也不秒建

        // === 玩家离开 boss 房 → 中止 boss 攻击 + 重置到 floating idle ===
        // 检测 zone2 → 非 zone2 的转换边沿，只触发一次
        const playerInBossRoom = (this._currentChunkId === 'zone2');
        if (this._golem && !this._golemDead && !this._inBossIntro && this._bossIntroFinished) {
            if (this._wasPlayerInBossRoom && !playerInBossRoom) {
                // kill 所有手 tween (smash/sweep 等都中止)
                this.tweens.killTweensOf(this._golem._handL);
                this.tweens.killTweensOf(this._golem._handR);
                this.tweens.killTweensOf(this._golem);
                // hands 回家 + 解除 busy + 颜色复位 + 贴图复位 + 旋转复位
                // 死手不动 (留在地上), 活手才 reset 回 idle 位置
                if (!this._golem._handL._dead) {
                    this._golem._handL.x = this._golem._homeX - 134;
                    this._golem._handL.y = this._golem._homeYair + 10;
                    this._golem._handL._busy = false;
                    this._golem._handL.rotation = 0;  // 复位 sweep 180° 翻转
                    if (this._golem._handL.anims && this._golem._handL.anims.stop) this._golem._handL.anims.stop();
                    if (this._golem._handL.setTexture && this.textures.exists('GHand_rockR')) {
                        this._golem._handL.setTexture('GHand_rockR');  // 复位为 idle 石拳贴图
                    }
                    if (this._golem._handL.clearTint) this._golem._handL.clearTint();
                    else if (this._golem._handL.setFillStyle) this._golem._handL.setFillStyle(0x4a3a2a);
                }
                if (!this._golem._handR._dead) {
                    this._golem._handR.x = this._golem._homeX + 134;
                    this._golem._handR.y = this._golem._homeYair + 10;
                    this._golem._handR._busy = false;
                    this._golem._handR.rotation = 0;
                    if (this._golem._handR.anims && this._golem._handR.anims.stop) this._golem._handR.anims.stop();
                    if (this._golem._handR.setTexture && this.textures.exists('GHand_rockR')) {
                        this._golem._handR.setTexture('GHand_rockR');
                    }
                    if (this._golem._handR.clearTint) this._golem._handR.clearTint();
                    else if (this._golem._handR.setFillStyle) this._golem._handR.setFillStyle(0x4a3a2a);
                }
                // boss 回 home + 重置贴图 (强制回 floating head_eye, 不再卡在 mouth_open / wake 等中间状态)
                this._golem.x = this._golem._homeX;
                this._golem.y = this._golem._homeYair;
                // 重置 body state — head_eye 会停 anim + 切到 GHead_eyeM + clearTint
                if (this._golem._setBodyState) this._golem._setBodyState('head_eye');
                // 重新应用 phase tint (head_eye 内部 clearTint 了)
                if (this._golem._phase2) this._golem.setTint(0xcc4444);
                else this._golem.clearTint();
                this._golem.state = 'floating';
                this._golem.attackCount = 0;
                this._golem.cd = 1500;  // 玩家回来后 1.5s buffer 不立即攻击
                // 清掉 vulnerable 期间的 beetle spawn 计数
                this._golem.vulnerableTimer = 0;
                this._golem._beetlesSpawnedThisVulnerable = 0;
            }
            this._wasPlayerInBossRoom = playerInBossRoom;
        }

        // Boss update — cinematic 期间跳过；玩家不在 boss 房也跳过 (避免攻击到 zone1)
        if (this._bosses && !this._inBossIntro && playerInBossRoom) {
            this._bosses.forEach(b => { if (b && b.update) b.update(time, delta, this.player); });
        }

        // (32, 30~32) — 玩家用钥匙开 KeyDoor 后, 走到门左侧 3 格 → 传送到 SZ3 起点
        if (!this._teleportingNext && this._keyDoor && this._keyDoor.opened &&
            this.player.x >= 32 * 32 && this.player.x < 33 * 32 &&
            this.player.y >= 30 * 32 && this.player.y < 33 * 32) {
            this._teleportingNext = true;
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
                this.scene.start('SafeZone25Scene', data);
            });
            return;
        }

        // 走过 col 92 右侧 + Boss 死 → 传送到 SafeZone3
        if (!this._teleportingNext && this.player.x >= 93 * 32 && this.player.y >= 12 * 32) {
            if (!this._golemDead) {
                this.player.body.setVelocityX(-300);
                return;
            }
            this._teleportingNext = true;
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
                this.scene.start('SafeZone25Scene', data);
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
        if (this.interactSystem) this.interactSystem.update();
        if (this.fogSystem) this.fogSystem.update(this.player.x, this.player.y);

        // R 键切换网格
        if (this.keyR && Phaser.Input.Keyboard.JustDown(this.keyR)) {
            if (this._gridGraphics) {
                this._gridGraphics.setVisible(!this._gridGraphics.visible);
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

        // 宝箱掉落物磁吸拾取 (阶段 2)
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
                            // 根据 kind/type 入库
                            if (d._dropKind === 'crystal') {
                                if (this.hudSystem) this.hudSystem.addCrystal(1);
                            } else if (d._dropKind === 'potion') {
                                const t = d._dropType;
                                if (t === 'life_potion') {
                                    // life_potion 没 Z/X/C 槽, 落地即生效 +1 爱心
                                    if (this.healthSystem) this.healthSystem.addHeart(1);
                                } else if (t === 'healing_potion' || t === 'health_potion') {
                                    if (this.inventorySystem) this.inventorySystem.addItem(t, 1);
                                }
                            }
                            // 强制刷新背包面板 + 物品栏 (addItem 内部已调 refreshBackpack, 这里多调一次 refreshQuick 确保物品栏图标 + 数量也立即更新)
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
        const inRange = dist <= 100;
        const inDialog = this.dialogSystem && this.dialogSystem.isOpen;
        cp.setHintVisible(inRange && !inDialog);
        // (用户) 场景侧旧回血循环已移除 — 与 HealthSystem.update 的中央回血 (+1 HP / -1% 腐蚀每秒, Extreme 关闭)
        //   双轨叠加, 曾导致神像每秒回 2 滴血
        // 阶段 9 — checkpoint 激活的瞬间 → 触发商人钻出来剧情 (只一次)
        if (cp.activated && !this._sz2MerchantRiseTriggered) {
            this._sz2MerchantRiseTriggered = true;
            // 等 "Checkpoint activated." 对话玩家关掉之后再启动商人
            this.time.delayedCall(800, () => {
                // 如果对话还开着, 再等一会
                const wait = this.time.addEvent({
                    delay: 200, loop: true, callback: () => {
                        if (!this.dialogSystem || !this.dialogSystem.isOpen) {
                            wait.remove();
                            this._sz2SpawnMerchantRise();
                        }
                    }
                });
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  SZ2 商人钻出来 + 剧情 (阶段 9)
    // ═══════════════════════════════════════════════════════════════
    _sz2SpawnMerchantRise() {
        const G = 32;
        const finalX = 26 * G + G / 2;
        const finalY = 18 * G + G / 2 + 11;  // +11 px 下移 (在 stand + dig 都生效)

        // 创建商人在 (26, 18) 但暂时用 dig 贴图覆盖, 隐藏 stand
        if (typeof MoleTrader === 'undefined') {
            console.warn('[SZ2] MoleTrader undefined');
            return;
        }
        this.moleTrader = new MoleTrader(this, finalX, finalY);
        if (this.walls) this.physics.add.collider(this.moleTrader, this.walls);
        if (this.uiCam) {
            try { this.uiCam.ignore(this.moleTrader); } catch(e) {}
            try { this.uiCam.ignore(this.moleTrader.interactionIcon); } catch(e) {}
        }
        // 注册 trader_dig 动画 (如未注册)
        if (this.textures.exists('Trader_dig') && !this.anims.exists('trader_dig')) {
            this.anims.create({
                key: 'trader_dig',
                frames: this.anims.generateFrameNumbers('Trader_dig', { start: 0, end: 21 }),
                frameRate: 11,
                repeat: 0
            });
        }
        // 镜头 zoom 2x + 对焦 (26, 18)
        this._cinematicLock = true;
        this._sz2SavedZoom = this.cameras.main.zoom;
        // 锁玩家 + 切回站立动画 (不要保持奔跑帧)
        if (this.player && this.player.body) {
            this.player.body.setVelocityX(0);
        }
        if (this.player && this.anims.exists('idle') && this.player.play) {
            this.player.play('idle', true);
        }
        const cam = this.cameras.main;
        cam.stopFollow();
        this.tweens.add({ targets: cam, zoom: 2.0, duration: 600, ease: 'Quad.easeOut' });
        cam.pan(finalX, finalY, 600, 'Quad.easeOut');

        // 商人钻出来动画: 反向播 trader_dig (从地底升起)
        // 整个动画往右 1 格 (+32), 往下 1.5 格 (+48), 整体放大 0.2 倍 (48 → 57.6)
        // dig 动画 Y 再往上 3+5=8 px (用户多次调整)
        this.moleTrader.setTexture('Trader_dig', 0);
        this.moleTrader.setDisplaySize(48 * 1.2, 48 * 1.2);  // 57.6 × 57.6
        this.moleTrader.setPosition(finalX - 32 + 32, finalY - 32 + 48 - 8);  // = (finalX, finalY + 8)
        // 动画期间关物理 (不要让重力把商人扯下去)
        if (this.moleTrader.body) {
            this.moleTrader.body.setAllowGravity(false);
            this.moleTrader.body.enable = false;
        }
        if (this.anims.exists('trader_dig')) {
            if (typeof this.moleTrader.playReverse === 'function') {
                // Phaser 3.50+ 支持反向播 (frame 21 → 0)
                this.moleTrader.playReverse('trader_dig');
            } else if (typeof this.moleTrader.play === 'function') {
                // fallback: 正向播 (视觉上是钻下去 但至少有动画)
                this.moleTrader.play('trader_dig');
            }
        }

        // 2 秒动画完成后切回 stand 贴图 + 开始对话
        this.time.delayedCall(2200, () => {
            this.moleTrader.setTexture('Trader_stand');
            this.moleTrader.setScale(1);
            // 商人生成位置 +5+5=10 px 下移 (用户多次调整)
            this.moleTrader.setPosition(finalX, finalY + 10);
            // 重开物理
            if (this.moleTrader.body) {
                this.moleTrader.body.enable = true;
                this.moleTrader.body.setAllowGravity(true);
                this.moleTrader.body.reset(finalX, finalY + 10);
            }
            if (this.anims.exists('trader_stand') && this.moleTrader.play) {
                this.moleTrader.play('trader_stand');
            }
            this._sz2MerchantDialog();
        });
    }

    _sz2MerchantDialog() {
        if (!this.dialogSystem) {
            this._endSZ2MerchantCutscene();
            return;
        }
        this.dialogSystem.showSequence([
            { speaker: 'Whisker', text: 'Long time no see, kid.' },
            { speaker: 'Whisker', text: "Glad to see you're still alive." },
            { speaker: 'Whisker', text: 'Come trade with me if you need anything.' }
        ], () => this._endSZ2MerchantCutscene());
    }

    _endSZ2MerchantCutscene() {
        const cam = this.cameras.main;
        const z0 = this._sz2SavedZoom || 1.25;
        this.tweens.add({ targets: cam, zoom: z0, duration: 500, ease: 'Quad.easeInOut' });
        if (this.player) cam.startFollow(this.player, true, 0.1, 0.1);
        this.time.delayedCall(550, () => {
            this._cinematicLock = false;
        });
        // 商人剧情结束 → 销毁 boss 房透明墙 (玩家可离开 boss 房)
        if (this._sz2WallLeft) { this._sz2WallLeft.destroy(); this._sz2WallLeft = null; }
        if (this._sz2WallRight) { this._sz2WallRight.destroy(); this._sz2WallRight = null; }
        this._sz2BossWallsBuilt = false;
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

        // Hysteresis: zone2 → zone1 边界往左移 1 格
        // 默认重叠区在 px=[8.5, 9.5], zone1→zone2 在 px>9.5 切换 (右行)
        // 这里强制 zone2→zone1 只在 px<=7.5 才切回 (左行多走 1 格才切镜头)
        if (this._currentChunkId === 'zone2' && newChunk.id === 'zone1' && px > 7.5) {
            return;
        }

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

    // ============= Boss Intro Cinematic =============
    _startBossIntro() {
        if (this._bossIntroStarted) return;
        this._bossIntroStarted = true;
        this._inBossIntro = true;
        this._cinematicLock = true;
        this._bossIntroDialogDone = false;
        this._bossIntroTakeoffDone = false;
        this._bossIntroFinished = false;

        // 停玩家 + 切到 idle 待机动画 (避免奔跑进 cinematic 时卡在 run 帧)
        if (this.player && this.player.body) {
            this.player.body.setVelocity(0, 0);
            if (this.anims.exists('idle')) {
                this.player.play('idle', true);
            }
        }

        // 隐藏 HUD (跟 Tutorial cinematic 一致)
        if (this.hudSystem && this.hudSystem.setHUDVisible) {
            this.hudSystem.setHUDVisible(false);
        }

        // 镜头特写: zoom 2x, 中心放在 grid (20, 17) = world (656, 560)
        // 用 Phaser 原生 pan + zoomTo (比 tween scrollX/Y 准, 自动处理 bounds/follow)
        const cam = this.cameras.main;
        cam.stopFollow();
        cam.setBounds(-99999, -99999, 199998, 199998);

        const FOCUS_X = 20 * 32 + 16;  // 656
        const FOCUS_Y = 17 * 32 + 16;  // 560
        const FOCUS_ZOOM = 2.3;
        const FOCUS_DURATION = 1000;

        cam.pan(FOCUS_X, FOCUS_Y, FOCUS_DURATION, 'Cubic.easeInOut');
        cam.zoomTo(FOCUS_ZOOM, FOCUS_DURATION, 'Cubic.easeInOut', false, (camera, progress) => {
            if (progress < 1) return;
            // zoom + pan 都完成 (zoomTo 跟 pan 同时长，所以一起结束)
            if (!this.dialogSystem) {
                this._bossIntroDialogDone = true;
                this._bossIntroTakeoffDone = true;
                this._tryFinishBossIntro();
                return;
            }
            // 5 句对话 (showSequence)：1 句睡醒怪声 + 4 句正式台词，第 5 句 onShow 触发 boss 起飞
            this.dialogSystem.showSequence([
                { speaker: 'Stone Guardian', text: "Ugh... ...hmm..." },
                {
                    speaker: 'Stone Guardian',
                    text: "It's been... so long... since I smelled this...",
                    onShow: () => {
                        // 第一句 dismiss → 开始 wake_part1 (frame 0-24, 停在 24)
                        if (this._golem && this._golem._setBodyState) {
                            this._golem._setBodyState('wake_part1');
                        }
                    }
                },
                { speaker: 'Stone Guardian', text: "You have trespassed... in my domain..." },
                { speaker: 'Stone Guardian', text: "You should not... be here..." },
                {
                    speaker: 'Stone Guardian',
                    text: "Let me... cleanse you...",
                    onShow: () => this._startBossTakeoff()
                }
            ], () => {
                this._bossIntroDialogDone = true;
                this._tryFinishBossIntro();
            });
        });
    }

    _startBossTakeoff() {
        if (!this._golem) return;
        // 起飞瞬间: 继续 wake 动画后半段 (frame 25-30)
        if (this._golem._setBodyState) {
            this._golem._setBodyState('wake_part2');
        }
        if (typeof AudioSystem !== 'undefined') AudioSystem.bgm(this, 'bgm_GolemBossFight');  // 起飞=战斗开始 → 切 Golem 战斗 BGM
        // 双手这时候还不显示 — 完全起飞后才出
        // 起身震屏 — 2s (boss takeoff tween 1.8s)
        this.cameras.main.shake(2000, 0.008);
        // boss 起飞: 1.8s y tween
        this.tweens.add({
            targets: this._golem,
            y: this._golem._homeYair,
            duration: 1800,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                // 起飞完成 → 进双手 orbit 阶段
                this._startHandsOrbit();
            }
        });
    }

    /** Boss 起飞到顶后, 双手出现, 用张开的手 (GHand_palmR) 拍 2 下, 然后回到 idle 位置 */
    _startHandsOrbit() {
        const golem = this._golem;
        if (!golem || !golem._handL || !golem._handR) {
            this._bossIntroTakeoffDone = true;
            this._tryFinishBossIntro();
            return;
        }
        // 双手生成的瞬间 — 显示双手 + boss body 切到 head_eye (GHead_eyeM)
        if (golem.showHands) golem.showHands();
        if (golem._setBodyState) golem._setBodyState('head_eye');

        // 切到张开的手 (palm)
        const palmTex = 'GHand_palmR';
        if (this.textures.exists(palmTex)) {
            golem._handL.setTexture(palmTex);
            golem._handR.setTexture(palmTex);
        }

        // 双手起始位置 (第一次拍手特别远 — 外推 +2 格 至 ±198, 第二次拍手用 ±144 标准距离)
        const FIRST_CLAP_START = 134 + 64;  // 198 — +2 格 (只用第一次)
        golem._handL.x = golem.x - FIRST_CLAP_START;
        golem._handL.y = golem.y;
        golem._handL.rotation = 0;
        golem._handR.x = golem.x + FIRST_CLAP_START;
        golem._handR.y = golem.y;
        golem._handR.rotation = 0;

        // 拍手位置 — 两手 hitbox 互相相碰 (用 golem._handHitboxHalf, 默认 32)
        // 不是用 160 frame 全宽 — 因为 frame 边缘大多是透明, 用 hitbox 更准
        const CLAP_X = golem._handHitboxHalf || 32;
        // 第二次拍手前回弹: 比 clap 远 2 格 → CLAP_X + 64
        const PULL_X = CLAP_X + 64;
        // 攻击时长
        const FIRST_CLAP_DUR = 380;   // 第一次距离远 → 略长
        const CLAP_DUR = 280;          // 第二次正常
        const PULL_DUR = 220;
        const RETURN_DUR = 400;
        const SHAKE_MS = 220;
        const SHAKE_INT = 0.012;

        const sc = this;
        // ===== Clap 1 (从 ±198 → ±80, 距离 118 px = 3.7 格) =====
        this.tweens.add({
            targets: golem._handL, x: golem.x - CLAP_X, duration: FIRST_CLAP_DUR, ease: 'Cubic.easeIn'
        });
        this.tweens.add({
            targets: golem._handR, x: golem.x + CLAP_X, duration: FIRST_CLAP_DUR, ease: 'Cubic.easeIn',
            onComplete: () => {
                sc.cameras.main.shake(SHAKE_MS, SHAKE_INT);
                // ===== Pull back to ±144 =====
                sc.tweens.add({
                    targets: golem._handL, x: golem.x - PULL_X, duration: PULL_DUR, ease: 'Cubic.easeOut'
                });
                sc.tweens.add({
                    targets: golem._handR, x: golem.x + PULL_X, duration: PULL_DUR, ease: 'Cubic.easeOut',
                    onComplete: () => {
                        // ===== Clap 2 (从 ±144 → ±80, 距离 64 px = 2 格) =====
                        sc.tweens.add({
                            targets: golem._handL, x: golem.x - CLAP_X, duration: CLAP_DUR, ease: 'Cubic.easeIn'
                        });
                        sc.tweens.add({
                            targets: golem._handR, x: golem.x + CLAP_X, duration: CLAP_DUR, ease: 'Cubic.easeIn',
                            onComplete: () => {
                                sc.cameras.main.shake(SHAKE_MS, SHAKE_INT);
                                // ===== Return to home (±134) =====
                                sc.tweens.add({
                                    targets: golem._handL, x: golem.x - 134, duration: RETURN_DUR, ease: 'Cubic.easeOut'
                                });
                                sc.tweens.add({
                                    targets: golem._handR, x: golem.x + 134, duration: RETURN_DUR, ease: 'Cubic.easeOut',
                                    onComplete: () => {
                                        // 还原 rock 贴图 (idle 用 GHand_rockR)
                                        if (sc.textures.exists('GHand_rockR')) {
                                            golem._handL.setTexture('GHand_rockR');
                                            golem._handR.setTexture('GHand_rockR');
                                        }
                                        sc._bossIntroTakeoffDone = true;
                                        sc._tryFinishBossIntro();
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
    }

    _tryFinishBossIntro() {
        if (!this._bossIntroDialogDone || !this._bossIntroTakeoffDone) return;
        if (this._bossIntroFinished) return;
        this._bossIntroFinished = true;
        if (typeof SaveSystem !== 'undefined') SaveSystem.autoSave(this);   // (用户) 剧情完成立即落盘

        const cam = this.cameras.main;
        // 不强制停 shake — 2s 已经自然结束 (takeoff 1.8s + 0.2s buffer)

        // 元气骑士 boss banner
        this._showBossBanner(() => {
            // 镜头复位
            this.tweens.add({
                targets: cam,
                zoom: 2,
                duration: 600,
                ease: 'Cubic.easeInOut',
                onComplete: () => {
                    this._currentChunkId = null;  // 强制 _updateChunkCamera 重设 bounds
                    this._updateChunkCamera();
                    cam.startFollow(this.player, true, 0.1, 0.1);
                    this._cinematicLock = false;
                    this._inBossIntro = false;
                    // 恢复 HUD
                    if (this.hudSystem && this.hudSystem.setHUDVisible) {
                        this.hudSystem.setHUDVisible(true);
                    }
                    // cinematic 完全结束 → 显示 boss + 双手 HP bar (用方法保证手 HP 也显示)
                    if (this._golem) {
                        if (this._golem.showHpBar) this._golem.showHpBar();
                        else {
                            if (this._golem._hpBg) this._golem._hpBg.setVisible(true);
                            if (this._golem._hpBar) this._golem._hpBar.setVisible(true);
                        }
                        // boss 切 floating 开打
                        this._golem.state = 'floating';
                        this._golem.attackCount = 0;
                        this._golem.cd = 1000;
                    }
                }
            });
        });
    }

    /** Boss 死亡最终流程: 掉 15 水晶 + 神像升起 + boss/双手沉地 (cinematic) */
    _bossDeathFinal(bx, by) {
        // 1) 掉 15 个水晶 (复用 monster_killed event 已有的 drop 逻辑, 自动落地散开)
        for (let i = 0; i < 15; i++) {
            this.events.emit('monster_killed', bx, by, 1.0);
        }

        // 2) 神像升起 + 沉地
        if (!this._sz2Checkpoint || !this._sz2Checkpoint.sprite) return;
        const finalY = this._sz2CheckpointTargetY - 2.5 * 32;
        const RISE_DURATION = 4000;
        this._sz2Checkpoint.sprite.setVisible(true);
        this.cameras.main.shake(RISE_DURATION, 0.006);

        this.tweens.add({
            targets: this._sz2Checkpoint.sprite,
            y: finalY,
            duration: RISE_DURATION,
            ease: 'Linear',
            onComplete: () => {
                this._sz2Checkpoint.y = finalY;
                this._sz2Checkpoint.sprite.setDepth(8);
                this._sz2Checkpoint._locked = false;
                this._sz2Checkpoint._lockedMsg = null;
                this._sz2Checkpoint._buried = false;
                if (this._sz2Checkpoint._origSetHintVisible) {
                    this._sz2Checkpoint.setHintVisible = this._sz2Checkpoint._origSetHintVisible;
                }
                if (this.interactSystem && this.interactSystem.interactables) {
                    this.interactSystem.interactables.push(this._sz2Checkpoint);
                }
                this._sz2Checkpoint._activate();

                // Boss + 双手沉地 — depth -10 (低于 cavetile -5, 被墙挡住)
                if (this._golem) {
                    this._golem.setDepth(-10);
                    this.tweens.add({
                        targets: this._golem,
                        y: '+=150',
                        duration: 4000,
                        ease: 'Cubic.easeIn'
                    });
                    if (this._golem._handL) {
                        this._golem._handL.setDepth(-10);
                        this.tweens.add({
                            targets: this._golem._handL,
                            y: '+=150', alpha: 0,
                            duration: 4000,
                            ease: 'Cubic.easeIn'
                        });
                    }
                    if (this._golem._handR) {
                        this._golem._handR.setDepth(-10);
                        this.tweens.add({
                            targets: this._golem._handR,
                            y: '+=150', alpha: 0,
                            duration: 4000,
                            ease: 'Cubic.easeIn'
                        });
                    }
                }
            }
        });
    }

    _showBossBanner(onDone) {
        const cam = this.cameras.main;
        const W = cam.width, H = cam.height;

        const container = this.add.container(-W, H / 2).setScrollFactor(0).setDepth(999).setScale(2.5);

        // 深石色底板 (520×220)，金棕描边
        const bg = this.add.rectangle(0, 0, 520, 220, 0x2a2218, 0.95)
            .setStrokeStyle(4, 0xaa8855);

        // boss 头像 — 用 GHead_eyeM 贴图 (96×128 自然比例), fallback 灰底 + X
        const portraitBg = this.add.rectangle(-150, 0, 140, 140, 0x222222, 0.5)
            .setStrokeStyle(3, 0xaa8855);
        const portraitItems = [portraitBg];
        if (this.textures.exists('GHead_eyeM')) {
            const portrait = this.add.image(-150, 0, 'GHead_eyeM').setDisplaySize(105, 140);
            portraitItems.push(portrait);
        } else {
            const px1 = this.add.rectangle(-150, 0, 100, 4, 0x444444); px1.angle = 45;
            const px2 = this.add.rectangle(-150, 0, 100, 4, 0x444444); px2.angle = -45;
            portraitItems.push(px1, px2);
        }

        // 名字大字 (居中)
        const nameText = this.add.text(60, 0, 'STONE GUARDIAN', {
            fontSize: '40px', color: '#ffffff',
            fontFamily: '"VT323", monospace',
            stroke: '#000', strokeThickness: 5
        }).setOrigin(0.5);

        container.add([bg, ...portraitItems, nameText]);

        this.time.delayedCall(20, () => {
            if (this.cameras.main && container.scene) {
                try { this.cameras.main.ignore(container); } catch(e) {}
            }
        });

        // 元气骑士式: slam in 左 → 停 → slide out 右 (无震屏)
        this.tweens.add({
            targets: container,
            x: W / 2,
            duration: 350,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.time.delayedCall(900, () => {
                    this.tweens.add({
                        targets: container,
                        x: W * 2,
                        duration: 300,
                        ease: 'Back.easeIn',
                        onComplete: () => {
                            container.destroy();
                            if (onDone) onDone();
                        }
                    });
                });
            }
        });
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
            // (用户) SZ2 BackgroundBlock 全部清空不要了 — 保留空函数, 调用点自然失效
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
        const airBg = (c1, r1, c2, r2) => { airRange(c1, r1, c2, r2); bgRange(c1, r1, c2, r2); };
        const placePlatform = (c, r) => {
            if (typeof PlatformBlock === 'undefined') return;
            // 必须先清掉这格的 wall (防止 wall+platform 叠一起变"透明墙")
            airRange(c, r, c, r);
            const p = new PlatformBlock(this, c * G + G/2, r * G + G/2, G, G);
            if (p.rect && p.rect.body) {
                if (p.rect.body.updateFromGameObject) p.rect.body.updateFromGameObject();
                p.rect.body.checkCollision.down = false;
                p.rect.body.checkCollision.left = false;
                p.rect.body.checkCollision.right = false;
                p.rect.body.checkCollision.up = true;
            }
        };

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

        // === 3 cells 在 (-1~0, 14-15) — level_1777651636433 ===
        airBg(-1, 15, 0, 15);
        airBg(0, 14, 0, 14);

        // === level_1777654256180 — 修补 (只留 spawn 区内的几行) ===
        wallRange(-28, 19, -28, 19);
        airBg(-22, 13, -22, 14);
        airBg(-21, 14, -21, 14);

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
        // (1~40, 23~25) 填 cavetile wall (限 bbox)
        wallRange(1, 23, 40, 25);

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

        // === Boss-only setup (所有怪物 spawn 已删除) ===
        this._pendingRespawns = [];

        // (32, 13~19) — Mob 透明墙（删除原本 33 列）
        for (let row = 13; row <= 19; row++) {
            new MobWall(this, 32 * G + G/2, row * G + G/2, G, G);
        }

        // Checkpoint 神像 (SZ2 — 移到 boss 房中央 col 20 row 20.5, 初始藏地底)
        this._checkpoint = new Checkpoint(this, 20 * G + G/2, 20.5 * G);
        this._checkpoint._locked = true;
        this._checkpoint._lockedMsg = 'The shrine remains silent.';
        this._checkpoint._buried = true;
        this._checkpoint.sprite.setDepth(8);
        this._sz2CheckpointTargetY = this._checkpoint.sprite.y;
        this._checkpoint.sprite.y = this._sz2CheckpointTargetY + 300;
        this._checkpoint.sprite.setVisible(false);
        // override setHintVisible 让 E icon 永不显示 (buried 时)
        this._checkpoint._origSetHintVisible = this._checkpoint.setHintVisible.bind(this._checkpoint);
        this._checkpoint.setHintVisible = () => {};
        if (this._checkpoint.eIcon) this._checkpoint.eIcon.setVisible(false);
        // 引用别名让 boss 死亡流程用
        this._sz2Checkpoint = this._checkpoint;

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

        // === level_1779248998990 — 出生区地形改造 ===
        // walls (28 cells)
        wallRange(-28, 14, -27, 19);
        wallRange(-27, 13, -22, 13);
        wallRange(-26, 12, -23, 12);
        wallRange(-23, 14, -21, 14);
        wallRange(-20, 15, -18, 15);
        // bg_blocks (25 cells, 先清墙再铺 bg)
        airBg(-16, 14, -11, 14);
        airBg(-14, 13, -13, 13);
        airBg(-7, 14, -6, 14);
        airBg(-6, 13, -6, 13);
        airBg(-5, 12, -2, 12);
        airBg(-5, 13, -1, 14);
        // airs (3 cells — 清掉 (0~2, 14) 上的 wall)
        airRange(0, 14, 2, 14);

        // ==========================================================
        // === SafeZone2 — Boss + Checkpoint ===
        // ==========================================================
        // (地形完全用 SZ1 原版，不改。Sign/Merchant/Wanderer 全删)

        // ============= Boss 房 — Golem (zone2 中央 col 20, row 14 浮空) =============
        this._sz2BossDoorLeft = null;
        this._sz2BossDoorRight = null;
        this._sz2BossFightStarted = false;

        if (typeof Golem !== 'undefined') {
            // 初始放在地面 (_homeYground = 23*32 - 40 - 64 - 32 = 600)
            // _homeYair (起飞目标) 仍是 row 14
            const groundY = 23 * 32 - 40 - 64 - 32;  // 600
            this._golem = new Golem(this, 20 * G + G/2, groundY);
            this._golem.setDepth(10);
            this._golem._homeX = 20 * G + G/2;
            this._golem._homeYair = 14 * G + G/2;
            // 初始 dormant — 不响应玩家距离检测，cinematic 触发后才唤醒
            this._golem.state = 'dormant';
            // 隐藏 HP bar + 双手 — 睡着状态不显示，cinematic 完成后再 show
            this._golem._hpBg.setVisible(false);
            this._golem._hpBar.setVisible(false);
            this._golem._handL.setVisible(false);
            this._golem._handR.setVisible(false);
            if (!this._bosses) this._bosses = [];
            this._bosses.push(this._golem);
        }

        // ============= Checkpoint 神像 (zone2 col 20, row 20.5 — 初始藏地底) =============
        if (typeof Checkpoint !== 'undefined') {
            this._sz2Checkpoint = new Checkpoint(this, 20 * G + G/2, 20.5 * G);
            this._sz2Checkpoint._locked = true;
            this._sz2Checkpoint._lockedMsg = 'The shrine remains silent.';
            this._sz2Checkpoint._buried = true;
            this._sz2Checkpoint.sprite.setDepth(-10);  // 暂时低于 cavetile wall (-5)，浮现完才升回 8
            this._sz2CheckpointTargetY = this._sz2Checkpoint.sprite.y;
            // 藏地底 — sprite 移到地底 + 完全不可见 + E icon 也不可见
            this._sz2Checkpoint.sprite.y = this._sz2CheckpointTargetY + 300;
            this._sz2Checkpoint.sprite.setVisible(false);
            // E icon: 暂时禁用 setHintVisible (boss 死后才恢复)
            this._sz2Checkpoint._origSetHintVisible = this._sz2Checkpoint.setHintVisible.bind(this._sz2Checkpoint);
            this._sz2Checkpoint.setHintVisible = () => {};  // no-op while buried
            if (this._sz2Checkpoint.eIcon) {
                this._sz2Checkpoint.eIcon.setVisible(false);
            }
            // 不要 push 到 interactables — 等 boss 死后再 push
            if (this.uiCam) {
                try { this.uiCam.ignore(this._sz2Checkpoint.sprite); } catch(e) {}
                if (this._sz2Checkpoint.eIcon) try { this.uiCam.ignore(this._sz2Checkpoint.eIcon); } catch(e) {}
            }
            // 修 dual-creation bug: 让 _checkpoint 跟 _sz2Checkpoint 指向同一个 (boss 死后 activate 的那个)
            // 先销毁前面那个孤立 sprite 避免重叠
            if (this._checkpoint && this._checkpoint !== this._sz2Checkpoint) {
                if (this._checkpoint.sprite && this._checkpoint.sprite.destroy) this._checkpoint.sprite.destroy();
                if (this._checkpoint.eIcon && this._checkpoint.eIcon.destroy) this._checkpoint.eIcon.destroy();
            }
            this._checkpoint = this._sz2Checkpoint;
        }

        // ============= Golem 死亡完整流程 =============
        this.events.on('golem_died', (data) => {
            this._golemDead = true;
            if (typeof AudioSystem !== 'undefined') AudioSystem.bgm(this, 'bgm_SafeZone2');  // 战斗结束 → 切回区域 BGM
            const bx = data ? data.x : 20 * G + G/2;
            const by = data ? data.y : 20 * G + G/2;

            // 死亡瞬间: depth 调到 cavetile wall (-5) 之下, 让 wall + 神像都显示优先级更高
            // (sink 阶段会再调到 -10 沉得更深)
            if (this._golem) this._golem.setDepth(-6);
            if (this._golem && this._golem._handL) this._golem._handL.setDepth(-6);
            if (this._golem && this._golem._handR) this._golem._handR.setDepth(-6);

            // Boss 死 → 所有它召唤的 beetle 一起死 (走每只 beetle 自己的 takeDamage 死亡流程: 灰 tint + 跳起 + dead anim + 600ms 后销毁)
            if (this.beetles && this.beetles.getChildren) {
                this.beetles.getChildren().forEach(beetle => {
                    if (beetle && beetle.active && beetle.hp > 0 && typeof beetle.takeDamage === 'function') {
                        beetle.takeDamage(9999);  // 一击致死, 触发死亡动画
                    }
                });
            }

            // 1000ms: boss 周围小染黄 (3 格半径 = 96px)
            this.time.delayedCall(1000, () => {
                this._yellowDirtSpread = {
                    cx: bx, cy: by,
                    radius: 0, maxRadius: 96,
                    active: true
                };
            });

            // 1500ms: 6 句临终对话 (showSequence) → 完后掉水晶 + 神像升起 + 沉地
            this.time.delayedCall(1500, () => {
                if (!this.dialogSystem) {
                    this._bossDeathFinal(bx, by);
                    return;
                }
                this.dialogSystem.showSequence([
                    { speaker: 'Stone Guardian', text: "Ah... a familiar scent... I can't quite remember..." },
                    { speaker: 'Stone Guardian', text: "I seem to have had a long dream... not a pleasant one..." },
                    { speaker: 'Stone Guardian', text: "But now I feel at peace... though drowsiness is returning..." },
                    { speaker: 'Stone Guardian', text: "I hope this time it's a beautiful dream..." },
                    { speaker: 'Stone Guardian', text: "Goodnight, world..." },
                    { speaker: 'Stone Guardian', text: "..." }
                ], () => {
                    this._bossDeathFinal(bx, by);
                });
            });
        });

        // (Sign 2/3 / Wanderer / KeyDoor 全删 — 用户不要)
        // Boss 死后出口自动开 (在 update 检查)

        // === SecretDoor 已删除（用户不要装饰） ===

        // === 最后一步: 把 spawn + boss 区以外全部封死 ===
        this._sealNonSpawnBossArea();

        // === level_1779609556838 — 用户在创造模式画的 SZ2 地形 ===
        // 4244 walls + 204 airs → 261 + 62 rects
        // 注意: 必须在 seal 之后 (seal 清空 outside-bbox, 这里加回设计地形)

        // --- airs (含 boss-zone3 开口 col 39-40 row 14-19) ---
        airRange(60, -27, 64, -27);
        airRange(66, -26, 66, -26);
        airRange(91, -20, 91, -20);
        airRange(13, -17, 14, -17);
        airRange(12, -16, 15, -16);
        airRange(11, -15, 16, -15);
        airRange(10, -14, 10, -14);
        airRange(16, -14, 16, -14);
        airRange(17, -13, 17, -13);
        airRange(18, -11, 18, -11);
        airRange(19, -10, 19, -10);
        airRange(20, -9, 20, -9);
        airRange(21, -8, 22, -8);
        airRange(86, -8, 86, -4);
        airRange(24, -7, 24, -7);
        airRange(23, -6, 23, -6);
        airRange(-12, -5, -9, -5);
        airRange(-14, -4, -13, -4);
        airRange(-23, 0, -20, 0);
        airRange(61, 0, 61, 0);
        airRange(-24, 1, -19, 1);
        airRange(-24, 2, -18, 2);
        airRange(1, 2, 1, 3);
        airRange(58, 2, 58, 2);
        airRange(-24, 3, -23, 3);
        airRange(82, 3, 82, 3);
        airRange(-24, 4, -24, 4);
        airRange(-6, 4, -6, 4);
        airRange(0, 4, 1, 4);
        airRange(57, 4, 57, 5);
        airRange(64, 4, 64, 4);
        airRange(74, 4, 81, 5);
        airRange(-4, 5, -4, 5);
        airRange(-1, 5, 0, 5);
        airRange(-3, 6, -1, 6);
        airRange(75, 6, 80, 6);
        airRange(76, 7, 78, 7);
        airRange(-19, 8, -11, 8);
        airRange(-17, 9, -14, 9);
        airRange(58, 11, 58, 11);
        airRange(39, 14, 40, 19);
        airRange(83, 15, 83, 15);
        airRange(81, 16, 84, 16);
        airRange(80, 17, 85, 17);
        airRange(78, 18, 86, 18);
        airRange(79, 19, 86, 19);
        airRange(80, 20, 86, 20);
        airRange(80, 21, 85, 21);
        airRange(48, 22, 48, 22);
        airRange(81, 22, 84, 22);
        airRange(47, 23, 47, 23);
        airRange(54, 23, 54, 23);
        airRange(45, 24, 46, 24);
        airRange(55, 24, 55, 24);
        airRange(43, 25, 44, 25);
        airRange(59, 28, 59, 28);
        airRange(58, 29, 60, 29);
        airRange(57, 30, 60, 32);
        airRange(57, 33, 59, 33);
        airRange(70, 34, 70, 34);
        airRange(69, 35, 69, 36);
        airRange(79, 35, 79, 35);

        // --- walls (plain Wall, 没 cavetile skin, 不卡) ---
        wallRange(-33, -42, -12, -42);
        wallRange(-33, -41, -11, -40);
        wallRange(-33, -39, 15, -39);
        wallRange(-33, -38, -27, -38);
        wallRange(-22, -38, 15, -38);
        wallRange(-33, -37, -28, -37);
        wallRange(-20, -37, 46, -37);
        wallRange(-33, -36, -29, -34);
        wallRange(-19, -36, 46, -36);
        wallRange(-18, -35, 63, -35);
        wallRange(-8, -34, 76, -34);
        wallRange(-33, -33, -28, -33);
        wallRange(-8, -33, 78, -33);
        wallRange(-33, -32, -26, -32);
        wallRange(7, -32, 80, -32);
        wallRange(-33, -31, -22, -31);
        wallRange(9, -31, 80, -31);
        wallRange(-33, -30, -21, -29);
        wallRange(12, -30, 25, -30);
        wallRange(35, -30, 80, -30);
        wallRange(37, -29, 78, -29);
        wallRange(-33, -28, -22, -28);
        wallRange(-9, -28, 3, -28);
        wallRange(39, -28, 46, -28);
        wallRange(52, -28, 78, -28);
        wallRange(-33, -27, -24, -27);
        wallRange(-12, -27, 5, -27);
        wallRange(42, -27, 44, -27);
        wallRange(54, -27, 59, -27);
        wallRange(65, -27, 78, -27);
        wallRange(-33, -26, -25, -25);
        wallRange(-14, -26, 8, -26);
        wallRange(55, -26, 58, -26);
        wallRange(67, -26, 78, -26);
        wallRange(-16, -25, 17, -25);
        wallRange(69, -25, 78, -25);
        wallRange(-33, -24, -26, -23);
        wallRange(-17, -24, 17, -24);
        wallRange(71, -24, 78, -24);
        wallRange(-18, -23, 16, -23);
        wallRange(27, -23, 34, -23);
        wallRange(72, -23, 78, -22);
        wallRange(-33, -22, -27, -17);
        wallRange(-18, -22, -6, -22);
        wallRange(2, -22, 12, -22);
        wallRange(26, -22, 35, -22);
        wallRange(48, -22, 52, -22);
        wallRange(-18, -21, -7, -21);
        wallRange(4, -21, 9, -21);
        wallRange(25, -21, 37, -21);
        wallRange(45, -21, 52, -21);
        wallRange(62, -21, 65, -21);
        wallRange(73, -21, 78, -21);
        wallRange(-18, -20, -8, -20);
        wallRange(5, -20, 8, -20);
        wallRange(24, -20, 39, -20);
        wallRange(43, -20, 52, -20);
        wallRange(60, -20, 66, -20);
        wallRange(73, -20, 90, -15);
        wallRange(-18, -19, -9, -19);
        wallRange(6, -19, 8, -19);
        wallRange(24, -19, 53, -19);
        wallRange(58, -19, 66, -19);
        wallRange(-18, -18, -11, -18);
        wallRange(6, -18, 6, -18);
        wallRange(24, -18, 66, -18);
        wallRange(-16, -17, -13, -17);
        wallRange(25, -17, 65, -17);
        wallRange(-33, -16, -26, -16);
        wallRange(26, -16, 64, -16);
        wallRange(-33, -15, -25, -13);
        wallRange(-3, -15, 0, -15);
        wallRange(28, -15, 63, -15);
        wallRange(-4, -14, 1, -14);
        wallRange(11, -14, 15, -14);
        wallRange(32, -14, 61, -14);
        wallRange(72, -14, 90, -14);
        wallRange(-6, -13, 1, -13);
        wallRange(10, -13, 16, -13);
        wallRange(38, -13, 60, -13);
        wallRange(72, -13, 78, -13);
        wallRange(84, -13, 90, -13);
        wallRange(-33, -12, -24, -12);
        wallRange(-8, -12, 1, -12);
        wallRange(10, -12, 17, -12);
        wallRange(41, -12, 60, -12);
        wallRange(71, -12, 76, -12);
        wallRange(85, -12, 90, -11);
        wallRange(-33, -11, -18, -11);
        wallRange(-11, -11, 0, -11);
        wallRange(11, -11, 17, -11);
        wallRange(44, -11, 59, -11);
        wallRange(70, -11, 75, -11);
        wallRange(-33, -10, -1, -10);
        wallRange(13, -10, 18, -10);
        wallRange(47, -10, 59, -10);
        wallRange(69, -10, 74, -9);
        wallRange(86, -10, 90, -9);
        wallRange(-33, -9, -2, -9);
        wallRange(14, -9, 19, -9);
        wallRange(48, -9, 59, -8);
        wallRange(-33, -8, -3, -8);
        wallRange(14, -8, 20, -8);
        wallRange(68, -8, 75, -8);
        wallRange(87, -8, 90, -4);
        wallRange(-33, -7, -4, -7);
        wallRange(13, -7, 23, -7);
        wallRange(49, -7, 60, -7);
        wallRange(68, -7, 78, -7);
        wallRange(-33, -6, -12, -6);
        wallRange(-9, -6, -5, -6);
        wallRange(5, -6, 6, -6);
        wallRange(12, -6, 22, -6);
        wallRange(49, -6, 61, -6);
        wallRange(68, -6, 79, -6);
        wallRange(-33, -5, -14, -5);
        wallRange(4, -5, 6, -5);
        wallRange(11, -5, 20, -5);
        wallRange(48, -5, 61, -5);
        wallRange(69, -5, 80, -5);
        wallRange(-33, -4, -15, -3);
        wallRange(2, -4, 6, -4);
        wallRange(11, -4, 18, -4);
        wallRange(48, -4, 62, -4);
        wallRange(69, -4, 74, -4);
        wallRange(77, -4, 81, -4);
        wallRange(1, -3, 6, -3);
        wallRange(12, -3, 16, -3);
        wallRange(29, -3, 36, -3);
        wallRange(47, -3, 62, -3);
        wallRange(70, -3, 72, -3);
        wallRange(79, -3, 81, -3);
        wallRange(86, -3, 90, -1);
        wallRange(-33, -2, -14, -2);
        wallRange(-2, -2, 6, -2);
        wallRange(13, -2, 14, -2);
        wallRange(28, -2, 38, -2);
        wallRange(46, -2, 62, -2);
        wallRange(-33, -1, -11, -1);
        wallRange(-1, -1, 6, -1);
        wallRange(28, -1, 37, -1);
        wallRange(46, -1, 61, -1);
        wallRange(-33, 0, -24, 0);
        wallRange(-19, 0, -8, 0);
        wallRange(0, 0, 7, 0);
        wallRange(28, 0, 36, 0);
        wallRange(46, 0, 60, 0);
        wallRange(85, 0, 90, 0);
        wallRange(-33, 1, -25, 4);
        wallRange(-18, 1, -9, 1);
        wallRange(1, 1, 7, 1);
        wallRange(29, 1, 36, 3);
        wallRange(47, 1, 58, 1);
        wallRange(84, 1, 90, 1);
        wallRange(-17, 2, -14, 2);
        wallRange(2, 2, 7, 2);
        wallRange(18, 2, 20, 2);
        wallRange(49, 2, 57, 2);
        wallRange(68, 2, 75, 2);
        wallRange(83, 2, 90, 3);
        wallRange(2, 3, 8, 3);
        wallRange(18, 3, 21, 3);
        wallRange(50, 3, 57, 3);
        wallRange(67, 3, 74, 3);
        wallRange(-5, 4, -5, 4);
        wallRange(2, 4, 9, 4);
        wallRange(17, 4, 22, 4);
        wallRange(28, 4, 37, 4);
        wallRange(50, 4, 56, 4);
        wallRange(65, 4, 73, 4);
        wallRange(82, 4, 90, 5);
        wallRange(-33, 5, -24, 5);
        wallRange(-6, 5, -5, 5);
        wallRange(1, 5, 39, 5);
        wallRange(51, 5, 56, 6);
        wallRange(64, 5, 73, 5);
        wallRange(-33, 6, -23, 6);
        wallRange(-7, 6, -4, 6);
        wallRange(0, 6, 40, 6);
        wallRange(64, 6, 74, 6);
        wallRange(81, 6, 90, 6);
        wallRange(-33, 7, -22, 7);
        wallRange(-8, 7, 42, 7);
        wallRange(51, 7, 57, 7);
        wallRange(65, 7, 75, 7);
        wallRange(79, 7, 90, 7);
        wallRange(-33, 8, -31, 15);
        wallRange(41, 8, 44, 8);
        wallRange(52, 8, 58, 10);
        wallRange(66, 8, 90, 8);
        wallRange(41, 9, 45, 12);
        wallRange(67, 9, 90, 10);
        wallRange(52, 11, 57, 11);
        wallRange(66, 11, 90, 11);
        wallRange(51, 12, 56, 12);
        wallRange(65, 12, 90, 12);
        wallRange(41, 13, 44, 13);
        wallRange(50, 13, 55, 13);
        wallRange(64, 13, 90, 13);
        wallRange(49, 14, 55, 14);
        wallRange(63, 14, 76, 14);
        wallRange(81, 14, 90, 14);
        wallRange(49, 15, 54, 15);
        wallRange(63, 15, 73, 15);
        wallRange(84, 15, 90, 15);
        wallRange(65, 16, 71, 16);
        wallRange(85, 16, 90, 16);
        wallRange(86, 17, 90, 17);
        wallRange(87, 18, 90, 20);
        wallRange(77, 19, 78, 19);
        wallRange(41, 20, 48, 21);
        wallRange(54, 20, 62, 20);
        wallRange(76, 20, 79, 20);
        wallRange(54, 21, 63, 22);
        wallRange(75, 21, 79, 21);
        wallRange(86, 21, 90, 21);
        wallRange(41, 22, 47, 22);
        wallRange(75, 22, 80, 22);
        wallRange(85, 22, 90, 22);
        wallRange(41, 23, 46, 23);
        wallRange(55, 23, 61, 23);
        wallRange(75, 23, 90, 23);
        wallRange(41, 24, 44, 24);
        wallRange(56, 24, 60, 25);
        wallRange(76, 24, 90, 24);
        wallRange(41, 25, 42, 25);
        wallRange(77, 25, 90, 28);
        wallRange(19, 26, 40, 26);
        wallRange(56, 26, 59, 26);
        wallRange(21, 27, 37, 27);
        wallRange(55, 27, 59, 27);
        wallRange(30, 28, 31, 32);
        wallRange(54, 28, 58, 28);
        wallRange(53, 29, 57, 29);
        wallRange(67, 29, 70, 29);
        wallRange(79, 29, 90, 29);
        wallRange(50, 30, 56, 30);
        wallRange(66, 30, 71, 30);
        wallRange(80, 30, 90, 30);
        wallRange(48, 31, 56, 31);
        wallRange(65, 31, 71, 31);
        wallRange(81, 31, 90, 31);
        wallRange(44, 32, 56, 32);
        wallRange(64, 32, 71, 32);
        wallRange(82, 32, 90, 32);
        wallRange(30, 33, 56, 33);
        wallRange(63, 33, 70, 33);
        wallRange(83, 33, 90, 34);
        wallRange(30, 34, 57, 34);
        wallRange(61, 34, 69, 34);
        wallRange(30, 35, 68, 36);
        wallRange(77, 35, 78, 35);
        wallRange(84, 35, 90, 35);
        wallRange(76, 36, 79, 37);
        wallRange(85, 36, 90, 38);
        wallRange(45, 37, 69, 37);
        wallRange(45, 38, 70, 38);
        wallRange(75, 38, 79, 38);
        wallRange(45, 39, 80, 39);
        wallRange(84, 39, 90, 39);
        wallRange(56, 40, 90, 42);

        // === level_1779609994149 — 用户追加修改 (19 walls + 3 airs) ===
        // 含 boss 房上方阶梯 + spawn 上方小墙
        airRange(8, 0, 8, 0);
        airRange(9, 1, 9, 1);
        airRange(10, 2, 10, 2);
        wallRange(7, -1, 7, -1);
        wallRange(8, 1, 8, 1);
        wallRange(8, 2, 9, 2);
        wallRange(9, 3, 11, 3);
        wallRange(17, 3, 17, 3);
        wallRange(10, 4, 16, 4);
        wallRange(-17, 9, -14, 9);

        // === level_1779614173222 — 用户追加修改 ===
        // 586 walls + 194 airs

        // --- airs ---
        airRange(-4, -35, 0, -35);
        airRange(-5, -34, 1, -34);
        airRange(-7, -33, 3, -33);
        airRange(50, -22, 52, -21);
        airRange(51, -20, 52, -20);
        airRange(106, -20, 109, -7);
        airRange(52, -19, 53, -19);
        airRange(86, -10, 86, -9);
        airRange(87, -8, 87, -8);
        airRange(90, -8, 90, -8);
        airRange(87, -7, 90, -4);
        airRange(106, -6, 106, -6);
        airRange(109, -6, 109, -5);
        airRange(86, -3, 86, -2);
        airRange(89, -3, 90, -3);
        airRange(-26, -2, -22, -2);
        airRange(90, -2, 90, 0);
        airRange(-27, -1, -20, -1);
        airRange(-28, 0, -24, 0);
        airRange(-19, 0, -19, 0);
        airRange(-29, 1, -25, 2);
        airRange(-18, 1, -18, 1);
        airRange(-17, 2, -17, 2);
        airRange(68, 2, 71, 2);
        airRange(-29, 3, -24, 3);
        airRange(67, 3, 70, 3);
        airRange(-28, 4, -24, 4);
        airRange(65, 4, 70, 4);
        airRange(-27, 5, -25, 5);
        airRange(64, 5, 69, 5);
        airRange(64, 6, 68, 6);
        airRange(65, 7, 67, 7);
        airRange(106, 10, 107, 10);

        // --- walls ---
        wallRange(-11, -42, 6, -42);
        wallRange(-10, -41, 6, -40);
        wallRange(-10, -39, -9, -35);
        wallRange(-14, -34, -9, -34);
        wallRange(-12, -33, -9, -33);
        wallRange(51, -28, 51, -28);
        wallRange(51, -27, 53, -27);
        wallRange(52, -26, 54, -26);
        wallRange(54, -25, 55, -25);
        wallRange(46, -22, 49, -22);
        wallRange(3, -21, 3, -21);
        wallRange(3, -20, 4, -20);
        wallRange(50, -20, 50, -20);
        wallRange(91, -20, 105, -16);
        wallRange(4, -19, 5, -17);
        wallRange(91, -15, 93, -15);
        wallRange(100, -15, 105, -15);
        wallRange(91, -14, 91, -11);
        wallRange(101, -14, 105, -14);
        wallRange(102, -13, 105, -11);
        wallRange(100, -10, 105, -10);
        wallRange(99, -9, 105, -9);
        wallRange(98, -8, 105, -8);
        wallRange(97, -7, 105, -7);
        wallRange(96, -6, 105, -4);
        wallRange(87, -3, 88, -3);
        wallRange(97, -3, 105, -3);
        wallRange(87, -2, 89, -2);
        wallRange(98, -2, 105, -1);
        wallRange(86, -1, 89, -1);
        wallRange(85, 0, 89, 0);
        wallRange(99, 0, 105, 3);
        wallRange(73, 1, 76, 1);
        wallRange(84, 1, 90, 1);
        wallRange(72, 2, 77, 2);
        wallRange(82, 2, 91, 2);
        wallRange(71, 3, 91, 3);
        wallRange(-23, 4, -22, 4);
        wallRange(-6, 4, -6, 4);
        wallRange(1, 4, 1, 4);
        wallRange(71, 4, 84, 4);
        wallRange(86, 4, 92, 4);
        wallRange(98, 4, 105, 5);
        wallRange(-28, 5, -28, 5);
        wallRange(-24, 5, -21, 5);
        wallRange(-7, 5, -7, 5);
        wallRange(-4, 5, -4, 5);
        wallRange(-1, 5, 0, 5);
        wallRange(70, 5, 82, 5);
        wallRange(86, 5, 89, 5);
        wallRange(91, 5, 94, 5);
        wallRange(-27, 6, -24, 6);
        wallRange(-22, 6, -20, 6);
        wallRange(-9, 6, -8, 6);
        wallRange(-3, 6, -1, 6);
        wallRange(69, 6, 80, 6);
        wallRange(88, 6, 88, 6);
        wallRange(91, 6, 105, 10);
        wallRange(-21, 7, -9, 7);
        wallRange(68, 7, 70, 7);
        wallRange(76, 7, 78, 7);
        wallRange(-19, 8, -11, 8);
        wallRange(51, 8, 51, 11);
        wallRange(66, 8, 67, 8);
        wallRange(65, 9, 66, 10);
        wallRange(65, 11, 65, 11);
        wallRange(64, 12, 64, 12);

        // === level_1779614173222 — 之前漏掉的 platform (11 cells) ===
        // 2 段水平 platform 在 row 9: col 46-50, col 59-64
        for (let c = 46; c <= 50; c++) placePlatform(c, 9);
        for (let c = 59; c <= 64; c++) placePlatform(c, 9);

        // === level_1779617581827 — 用户追加修改 ===
        // 168 walls + 93 airs
        // --- airs ---
        airRange(15, -31, 20, -31);
        airRange(27, -31, 33, -31);
        airRange(12, -30, 21, -30);
        airRange(27, -23, 30, -23);
        airRange(25, -22, 27, -22);
        airRange(72, -22, 72, -22);
        airRange(23, -21, 25, -21);
        airRange(23, -20, 23, -20);
        airRange(73, -20, 73, -17);
        airRange(-3, -15, 0, -15);
        airRange(-4, -14, 1, -14);
        airRange(-3, -13, 1, -13);
        airRange(-1, -12, 1, -12);
        airRange(0, -11, 0, -11);
        airRange(64, 1, 64, 1);
        airRange(75, 14, 76, 14);
        airRange(72, 15, 73, 15);
        airRange(70, 16, 71, 16);
        airRange(83, 27, 85, 27);
        airRange(82, 28, 86, 28);
        airRange(80, 29, 86, 30);
        airRange(81, 31, 84, 31);
        airRange(82, 32, 83, 32);
        // --- walls ---
        wallRange(81, -32, 104, -32);
        wallRange(81, -31, 87, -30);
        wallRange(100, -31, 104, -31);
        wallRange(103, -30, 104, -28);
        wallRange(79, -29, 87, -28);
        wallRange(79, -27, 104, -24);
        wallRange(14, -26, 17, -26);
        wallRange(18, -25, 19, -25);
        wallRange(18, -24, 18, -24);
        wallRange(72, -23, 104, -23);
        wallRange(-5, -22, 1, -22);
        wallRange(13, -22, 13, -22);
        wallRange(73, -22, 104, -22);
        wallRange(-6, -21, 2, -21);
        wallRange(79, -21, 104, -21);
        wallRange(-19, -20, -19, -19);
        wallRange(-2, -20, 2, -20);
        wallRange(0, -19, 3, -19);
        wallRange(23, -19, 23, -19);
        wallRange(2, -18, 3, -18);
        wallRange(7, -18, 7, -18);
        wallRange(22, -18, 23, -18);
        wallRange(3, -17, 3, -17);
        wallRange(6, -17, 6, -17);
        wallRange(22, -17, 24, -17);
        wallRange(4, -16, 5, -15);
        wallRange(24, -16, 25, -16);
        wallRange(27, -15, 27, -15);
        wallRange(-5, -13, -5, -13);
        wallRange(-4, -12, -2, -12);
        wallRange(4, -9, 6, -9);
        wallRange(3, -8, 7, -8);
        wallRange(3, -7, 8, -7);
        wallRange(2, -6, 4, -6);
        wallRange(7, -6, 7, -6);
        wallRange(2, -5, 3, -5);
        wallRange(63, -2, 63, -2);
        wallRange(62, -1, 64, -1);
        wallRange(61, 0, 64, 0);
        wallRange(62, 1, 63, 1);
        wallRange(74, 23, 74, 23);
        wallRange(74, 24, 75, 24);
        wallRange(73, 25, 76, 26);
        wallRange(76, 27, 77, 27);
        wallRange(77, 28, 78, 28);
        wallRange(78, 29, 79, 29);
        wallRange(72, 31, 72, 32);

        // === level_1779620345018 — 用户追加 (20 walls + 6 airs + 6 platforms) ===
        // 在 zone3 区, 楼梯 + platform 走道
        airRange(47, 20, 48, 20);
        airRange(54, 20, 54, 20);
        airRange(48, 22, 48, 22);
        airRange(48, 23, 49, 23);
        wallRange(47, 23, 47, 23);
        wallRange(45, 24, 48, 24);
        wallRange(43, 25, 48, 25);
        wallRange(41, 26, 45, 26);
        wallRange(38, 27, 41, 27);
        // platform 走道 (col 48-53 at row 21, 单向从上踩)
        for (let c = 48; c <= 53; c++) placePlatform(c, 21);

        // === level_1779631580629 — 用户追加 ===
        // 29 walls + 36 airs + 59 crystal ores + 3 key_door cells
        // --- airs ---
        airRange(100, -10, 101, -10);
        airRange(99, -9, 101, -9);
        airRange(98, -8, 100, -8);
        airRange(65, 11, 66, 11);
        airRange(64, 12, 66, 13);
        airRange(63, 14, 65, 14);
        airRange(63, 15, 64, 15);
        airRange(48, 24, 48, 24);
        airRange(84, 26, 86, 26);
        airRange(86, 27, 87, 27);
        airRange(87, 28, 88, 30);
        airRange(85, 31, 87, 31);
        // --- walls ---
        wallRange(92, -14, 92, -14);
        wallRange(58, 11, 58, 11);
        wallRange(57, 12, 59, 12);
        wallRange(56, 13, 59, 13);
        wallRange(56, 14, 56, 14);
        wallRange(64, 16, 64, 16);
        wallRange(65, 17, 68, 17);
        wallRange(46, 26, 48, 26);
        wallRange(42, 27, 46, 27);
        wallRange(54, 27, 54, 27);
        wallRange(32, 28, 34, 28);
        wallRange(32, 29, 33, 29);
        // --- crystal ores (59 个, 每个 hp=10 dropCount=1) ---
        if (typeof CrystalBlock !== 'undefined') {
            const oreSpots = [
                [57, 33],
                [60, 34],
                [73, 38],
                [70, 37],
                [84, 38],
                [81, 39],
                [78, 34],
                [68, 28],
                [88, 30],
                [81, 22],
                [86, 20],
                [74, 22],
                [61, 19],
                [66, 13],
                [50, 12],
                [54, 26],
                [49, 30],
                [43, 7],
                [38, 4],
                [47, -4],
                [31, -4],
                [20, 1],
                [14, 3],
                [8, 0],
                [12, -7],
                [18, -11],
                [25, -21],
                [34, -24],
                [15, -27],
                [12, -15],
                [-10, -1],
                [0, 4],
                [-5, 3],
                [-11, 6],
                [-22, 3],
                [-16, 6],
                [-4, -14],
                [-16, -11],
                [-22, -12],
                [-26, -17],
                [-19, -21],
                [-10, -28],
                [-23, -32],
                [0, -3],
                [1, -29],
                [28, 3],
                [58, 7],
                [70, 4],
                [62, -5],
                [70, -12],
                [63, -22],
                [51, -20],
                [42, -20],
                [96, 5],
                [92, 3],
                [96, -7],
                [79, -7],
                [86, -2],
                [79, 2],
                // === level_1779789895012.json — 68 个额外水晶 ===
                [-3, 12], [-9, 15], [-12, 14], [3, 19], [-17, 19],
                [39, 14], [52, 16], [71, 16], [78, 14], [84, 16],
                [61, 24], [59, 28], [74, 27], [85, 26], [81, 29],
                [82, 33], [72, 33], [58, 14],
                [58, 2], [63, 2],
                [73, -3], [80, -2], [80, -13], [85, -10], [91, -9],
                [93, -14], [97, -15], [101, -12], [97, -1], [90, -1],
                [60, -10], [67, -18], [69, -24], [61, -27], [52, -25],
                [46, -27], [39, -27], [32, -31], [28, -31], [22, -29],
                [17, -31], [10, -30],
                [12, -21], [28, -14], [36, -13], [44, -10],
                [8, -18], [18, -23], [11, -10], [7, -5], [18, -3],
                [22, -6], [27, -1],
                [0, -18], [-9, -18], [-18, -17], [-24, -25],
                [-16, -34], [-6, -33], [-1, -35], [-24, -38], [-28, -36],
                [-2, -8], [-8, -5], [-14, -4],
                [-1, 0], /* (-12, 2) — 跟新骷髅位置冲突, 跳过 */
                [-23, -2], [-29, 1]
            ];
            // (用户修复) 原名 _sz2CrystalOres — 跟挖掘检查读的 _crystalOres 名字分裂, 矿永远打不到; 统一为 _crystalOres
            this._crystalOres = this._crystalOres || [];
            oreSpots.forEach(([c, r]) => {
                airRange(c, r, c, r); // 先清墙再放矿
                const ore = new CrystalBlock(this, c * G + G/2, r * G + G/2, { hp: 10, dropCount: 1 });
                this._crystalOres.push(ore);
            });
        }
        // === level_1779809570370.json — SZ2 怪物 spawn 批量 (128 个) ===
        // 接到 _pendingRespawns 系统 → 死后自动等 5-8 分钟 + 玩家不在 chunk 时重生

        // helper: 找出 (col, row) 落在哪个 chunk
        const _getChunkForCell = (col, row) => {
            if (!this._chunks) return null;
            for (const c of this._chunks) {
                if (col >= c.x1 && col <= c.x2 && row >= c.y1 && row <= c.y2) return c;
            }
            return null;
        };

        // 类型 → class + 物理 group 映射
        const _spawnSZ2Monster = (type, col, row) => {
            const x = col * G + G/2;
            const y = row * G + G/2;
            let m = null;
            let cls = null;
            let groupName = null;
            try {
                switch (type) {
                    case 'spider':
                        if (typeof CrystalHunterSpider !== 'undefined') { cls = CrystalHunterSpider; groupName = 'spiders'; }
                        break;
                    case 'bat':
                        if (typeof CrystalBat !== 'undefined') { cls = CrystalBat; groupName = 'bats'; }
                        break;
                    case 'slime':
                        if (typeof CrystalSlime !== 'undefined') { cls = CrystalSlime; groupName = 'slimes'; }
                        break;
                    case 'beetle':
                        if (typeof CrystalBeetle !== 'undefined') { cls = CrystalBeetle; groupName = 'beetles'; }
                        break;
                    case 'earthworm':
                        if (typeof CrystalEarthworm !== 'undefined') { cls = CrystalEarthworm; groupName = 'earthworms'; }
                        break;
                    case 'bungee_spider':
                        if (typeof CrystalBungeeSpider !== 'undefined') { cls = CrystalBungeeSpider; groupName = 'bungeeSpiders'; }
                        break;
                    case 'volatile':
                        if (typeof VolatileCrystal !== 'undefined') { cls = VolatileCrystal; groupName = 'volatileCrystals'; }
                        break;
                }
                if (!cls) return null;
                m = new cls(this, x, y);
                this[groupName].add(m);
                // 蝙蝠 — group.add 可能重置 body 设置, 显式关闭重力 (跟 SZ1 addMon 同款)
                if (groupName === 'bats' && m.body) {
                    m.body.setAllowGravity(false);
                    m.body.setVelocity(0, 0);
                }
                // 标记 spawn 信息 → 死后用于复活
                m._spawnX = x;
                m._spawnY = y;
                m._spawnClass = cls;
                m._spawnGroupName = groupName;
                m._homeChunk = _getChunkForCell(col, row);
                // 死亡监听 — 推入 pendingRespawns (5-8 分钟随机)
                m.once('destroy', () => {
                    const delay = Phaser.Math.Between(300000, 480000);  // 5~8 分钟
                    if (!this._pendingRespawns) this._pendingRespawns = [];
                    this._pendingRespawns.push({
                        cls, groupName, x, y,
                        homeChunk: m._homeChunk,
                        readyAt: this.time.now + delay
                    });
                });
            } catch (e) { console.warn('[SZ2] spawn fail', type, col, row, e.message); }
            return m;
        };

        const _sz2MonsterSpawns = [
            ['beetle',36,32],['bat',36,28],['bungee_spider',47,27],['earthworm',45,31],
            ['volatile',55,26],['volatile',77,18],['volatile',75,37],
            ['bungee_spider',83,15],['bungee_spider',63,23],['bungee_spider',84,26],
            ['spider',82,39],['spider',71,38],['slime',76,35],['earthworm',87,31],
            ['bat',82,28],['bat',71,33],['bat',60,26],['bat',80,14],
            ['slime',84,22],['earthworm',70,28],['beetle',59,34],['slime',64,31],
            ['bungee_spider',66,11],['bungee_spider',61,1],['bungee_spider',84,-12],
            ['bat',99,-15],['bat',77,-12],['slime',98,-8],['earthworm',76,-8],
            ['slime',95,5],['slime',81,2],['earthworm',88,-4],['beetle',76,0],
            ['spider',93,4],['spider',100,-8],['spider',84,0],
            ['bat',70,-2],['bat',61,-13],['bat',72,-22],['bat',59,-26],
            ['bungee_spider',65,-26],['bungee_spider',66,-17],['earthworm',71,-13],
            ['volatile',61,-7],['slime',58,-20],['beetle',52,-19],
            ['bungee_spider',48,-28],['bungee_spider',30,-31],['spider',37,-22],
            ['bat',36,-29],['bat',23,-29],['bat',14,-22],['bat',11,-30],
            ['bungee_spider',16,-31],['slime',12,-26],['slime',30,-23],['slime',44,-21],
            ['earthworm',33,-24],['earthworm',18,-26],['earthworm',13,-15],
            ['earthworm',23,4],['bungee_spider',23,-6],['spider',9,1],['beetle',15,3],
            ['bat',15,-2],['bat',8,-6],['slime',27,4],['slime',33,-4],['earthworm',35,-4],
            ['bungee_spider',38,-12],['bat',46,-10],['bat',30,-14],['bat',47,2],
            ['slime',41,6],['volatile',40,5],['volatile',18,1],['volatile',20,-9],
            ['volatile',27,-22],['volatile',47,-23],['volatile',8,-27],
            ['bungee_spider',11,-21],['beetle',9,-26],
            ['beetle',-18,6],['beetle',-12,6],['slime',-15,6],
            ['bungee_spider',-26,-2],['bungee_spider',-2,-1],['bungee_spider',-11,-6],
            ['slime',-2,5],['earthworm',-27,5],['earthworm',-7,4],
            ['bat',-20,-1],['bat',-13,-5],['bat',-28,0],
            ['volatile',-23,3],['volatile',-2,-3],['volatile',-6,-14],['volatile',-25,-16],
            ['volatile',-17,-25],['volatile',-21,-31],['volatile',-3,-29],
            ['bungee_spider',-25,-38],['bungee_spider',-4,-35],['bungee_spider',-22,-27],
            ['bungee_spider',-12,-17],
            ['bat',-3,-20],['bat',-16,-16],['bat',-26,-22],['bat',-13,-33],
            ['bat',-22,-37],['bat',1,-34],
            ['earthworm',-25,-32],['earthworm',-1,-29],['earthworm',-19,-12],
            ['beetle',-21,-12],['slime',-14,-11],['slime',-14,-3],
            ['earthworm',-2,-13],['bungee_spider',38,-1],['earthworm',48,-6],
            ['earthworm',60,-21],['volatile',65,-22],['slime',71,2],
            ['volatile',81,-5],['volatile',91,1],['volatile',57,6],
            ['bungee_spider',22,-16],['beetle',-8,-13]
        ];
        let _sz2SpawnCount = 0;
        _sz2MonsterSpawns.forEach(([t, c, r]) => {
            if (_spawnSZ2Monster(t, c, r)) _sz2SpawnCount++;
        });
        // console.log('[SZ2] Spawned', _sz2SpawnCount, '/', _sz2MonsterSpawns.length, 'monsters from JSON');   // (用户) 诊断日志静默

        // --- KeyDoor (33, 30~32) — 3 格高, 黄钥匙开 (黄钥匙来自 水晶族 NPC 任务)
        //     存为 this._keyDoor (跟 Tutorial/SZ1 同字段名) → InteractSystem 自动接管 E icon + 对话 + 开门 ---
        airRange(33, 30, 33, 32);
        if (typeof KeyDoor !== 'undefined') {
            this._keyDoor = new KeyDoor(
                this,
                33 * G + G/2,
                (30 + 32 + 1) / 2 * G,
                G,
                3 * G,
                {}
            );
            // console.log('[SZ2] KeyDoor created at (33, 30~32) — handled by InteractSystem');   // (用户) 诊断日志静默
        }

        // === 阶段 1+2: Chest + 骷髅 Hint + 水晶族 NPC ===
        // -- 5 个宝箱 (Chest) -- (新增 (-2, -29) 替代原本的骷髅位置)
        if (typeof Chest !== 'undefined') {
            const chestSpots = [[-26, 5], [25, 4], [99, -8], [86, 31], [-2, -29]];
            chestSpots.forEach(([c, r]) => {
                airRange(c, r, c, r);  // 先清掉这格的墙
                new Chest(this, c, r);
            });
            // console.log('[SZ2] 5 Chests placed at', chestSpots);   // (用户) 诊断日志静默
        }

        // -- 4 个骷髅 Hint (corpse 视觉 + Hint 交互, 各有独特对话 + 遗物) --
        this._foundSkeletons = this._foundSkeletons || new Set();
        if (typeof Corpse !== 'undefined' && typeof Hint !== 'undefined') {
            const skeletonSpots = [
                { col: -26, row: -33, variant: 'corpse1', yOffset: 16 },
                { col: 77,  row: -8,  variant: 'corpse2' },
                { col: 83,  row: 22,  variant: 'corpse3' },
                { col: -12, row: -2,  variant: 'corpse1', yOffset: 16 }   // 下移 16 px (用户调整)
            ];
            // 每个骷髅独立 4 行对话, 末行交代遗物名
            // 4 个身份角色: 学者 (scholar), 战士 (warrior), 行者 (wanderer), 母亲 (caregiver)
            const skeletonDialogs = [
                // 0 - (-26, -33) 学者 (corpse1) — 写满字的晶碑
                [
                    { speaker: 'You',     text: 'A small crystal-folk... one hand still rests on a thin stone tablet.' },
                    { speaker: 'You',     text: 'Faint scratches cover its surface — writing, etched in their final hours.' },
                    { speaker: 'Tablet', text: '"...I record what I see, while the light still holds..."' },
                    { speaker: 'You',     text: '* You take the Scholar\u2019s Crystal Tablet. *' }
                ],
                // 1 - (77, -8) 战士 (corpse2) — 断矛
                [
                    { speaker: 'You', text: 'A larger crystal-folk, slumped against the rock, arms braced as if still holding the line.' },
                    { speaker: 'You', text: 'Their body bears the marks of a hard fight — they did not fall easy.' },
                    { speaker: 'You', text: 'Beside them lies the broken half of a crystal spear.' },
                    { speaker: 'You', text: '* You take the Sentinel\u2019s Broken Spearhead. *' }
                ],
                // 2 - (83, 22) 行者 (corpse3) — 罗盘 + 地图残卷
                [
                    { speaker: 'You', text: 'A weathered traveler. A small pouch is still strapped at their side.' },
                    { speaker: 'You', text: 'Inside: faded sketches of caves and tunnels, drawn with patient hands.' },
                    { speaker: 'You', text: 'Tucked among them, a tiny crystal compass — its needle long since stilled.' },
                    { speaker: 'You', text: '* You take the Wanderer\u2019s Crystal Compass. *' }
                ],
                // 3 - (-12, -2) 母亲 (corpse1) — 抱着孩子玩具
                [
                    { speaker: 'You', text: 'A small crystal-folk, curled tight, arms wrapped around something held close.' },
                    { speaker: 'You', text: 'Cradled against their chest: a tiny crystal carving — a child\u2019s toy, made with care.' },
                    { speaker: 'You', text: 'They never let it go, not even at the end.' },
                    { speaker: 'You', text: '* You take the Keepsake of the Lost. *' }
                ]
            ];
            skeletonSpots.forEach((spot, idx) => {
                airRange(spot.col, spot.row, spot.col, spot.row);
                const yOff = spot.yOffset || 0;
                new Corpse(this, spot.col, spot.row, spot.variant, { yOffset: yOff });
                new Hint(this, spot.col, spot.row, {
                    yOffset: yOff,
                    onInteract: (firstTime) => {
                        if (!this.dialogSystem) return;
                        if (firstTime) {
                            // 首次 — 完整 4 行 + 拾取遗物
                            this.dialogSystem.showSequence(skeletonDialogs[idx], () => {
                                this._foundSkeletons.add(idx);
                                // console.log('[SZ2] Skeleton #' + idx + ' relic taken. Total: ' + this._foundSkeletons.size + '/4');   // (用户) 诊断日志静默
                            });
                        } else {
                            // 重复 — 一句话提示
                            this.dialogSystem.show({ speaker: 'You', text: 'I\u2019ve already taken what they had.' });
                        }
                    }
                });
            });
            // console.log('[SZ2] 4 skeleton hints placed (with unique dialog + relic)');   // (用户) 诊断日志静默
        }

        // -- 1 个水晶族 NPC (43, 18) — 用 CrystalNpc entity (SZ3 也会复用)
        // yOffset: 20 - 用户要求生成位置再往下 20 pixel
        if (typeof CrystalNpc !== 'undefined') {
            this._crystalNpcDialogState = 0;
            this._crystalNpcRewardGiven = false;
            const cnpc = new CrystalNpc(this, 43, 18, {
                npcType: 'tired_guy',   // 坐着的疲惫者 (Tired_guy_sit 64×64×17帧, 原图朝左) — 贴合 "I can hardly move"
                yOffset: 15,  // 20-5=15 (用户多次调整)
                onInteract: () => {
                    const s = this;
                    const found = s._foundSkeletons ? s._foundSkeletons.size : 0;
                    if (!s.dialogSystem) return;
                    if (s._crystalNpcDialogState === 0) {
                        // 第一次对话
                        s.dialogSystem.showSequence([
                            { speaker: 'Crystal Folk', text: "I never thought... I'd meet a living soul again..." },
                            { speaker: 'Crystal Folk', text: "I'm not feeling well... I can hardly move..." },
                            { speaker: 'Crystal Folk', text: 'Can you find the remains of my 4 friends? I have something for you in return...' }
                        ]);
                        s._crystalNpcDialogState = 1;
                    } else if (found >= 4 && !s._crystalNpcRewardGiven) {
                        // 找完 4 个骷髅 → 奖励
                        s._crystalNpcRewardGiven = true;
                        s.dialogSystem.showSequence([
                            { speaker: 'Crystal Folk', text: 'You found them all... I had hoped, but I dared not believe...' },
                            { speaker: 'Crystal Folk', text: 'A scholar... a sentinel... a wanderer... and a parent who never let go.' },
                            { speaker: 'Crystal Folk', text: 'Their relics — keep them, please. They are why our story did not vanish.' },
                            { speaker: 'Crystal Folk', text: 'And take this — it was meant for the one who would remember us.' },
                            { speaker: 'You',          text: '* Mysterious Key +1 *' },
                            { speaker: 'Crystal Folk', text: 'I am so tired now... let me rest...' }
                        ]);
                        if (s.inventorySystem && s.inventorySystem.addItem) {
                            s.inventorySystem.addItem('key', 1);
                        }
                    } else if (s._crystalNpcRewardGiven) {
                        s.dialogSystem.show({ speaker: 'Crystal Folk', text: "I'm so tired now... let me rest..." });
                    } else {
                        // 重复对话 (没找完 4 个)
                        s.dialogSystem.show({ speaker: 'Crystal Folk', text: 'Can you find the remains of my 4 friends? I have something for you in return...' });
                    }
                }
            });
            // 水晶族受重力影响 — 落地停在墙上
            if (cnpc && cnpc.sprite && this.walls) {
                this.physics.add.collider(cnpc.sprite, this.walls);
            }
            // console.log('[SZ2] Crystal Folk NPC placed at (43, 18)');   // (用户) 诊断日志静默
        }
    }

    /**
     * 删除 spawn (zone1) + boss (zone2) 以外的 wall / bg / skin.
     * 仅清理初始 create() loop 创建的 buffer (level data 源码已经删了).
     */
    _sealNonSpawnBossArea() {
        const G = 32;
        const inSpawnBoss = (cx, cy) => cx >= -30 && cx <= 40 && cy >= 8 && cy <= 25;

        // Walls
        let wallsDestroyed = 0;
        if (this.walls && this.walls.getChildren) {
            this.walls.getChildren().slice().forEach(w => {
                const cx = Math.floor(w.x / G), cy = Math.floor(w.y / G);
                if (!inSpawnBoss(cx, cy)) {
                    try { w.destroy(); } catch(e) {}
                    wallsDestroyed++;
                }
            });
        }

        // wallRects
        if (this.wallRects) {
            this.wallRects = this.wallRects.filter(rect => {
                const cx = Math.floor((rect.x + rect.width / 2) / G);
                const cy = Math.floor((rect.y + rect.height / 2) / G);
                return inSpawnBoss(cx, cy);
            });
        }

        // Cavetile skins + BackgroundBlocks (一次 children loop 搞定)
        let skinsDestroyed = 0, bgDestroyed = 0;
        this.children.list.slice().forEach(c => {
            if (!c) return;
            const cx = Math.floor(c.x / G), cy = Math.floor(c.y / G);
            if (inSpawnBoss(cx, cy)) return;
            // Cavetile skin
            if (c.depth === -5 && c.texture && c.texture.key && c.texture.key.startsWith('Cavetile_')) {
                try { c.destroy(); } catch(e) {}
                skinsDestroyed++;
                return;
            }
            // BackgroundBlock
            if (c._isBackgroundBlock) {
                try { c.destroy(); } catch(e) {}
                bgDestroyed++;
            }
        });

        // gridSystem 标外面为 AIR
        if (this.gridSystem && typeof GridSystem !== 'undefined') {
            for (let c = -39; c <= 139; c++) {
                for (let r = -75; r <= 72; r++) {
                    if (!inSpawnBoss(c, r)) {
                        this.gridSystem.markRect(c * G + G/2, r * G + G/2, G, G, GridSystem.AIR);
                    }
                }
            }
        }

        // console.log(`[SZ2 Seal] walls: -${wallsDestroyed}, skins: -${skinsDestroyed}, bg: -${bgDestroyed}`);   // (用户) 诊断日志静默
    }
}