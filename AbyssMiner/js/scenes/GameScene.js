class MainGameScene extends Phaser.Scene {
    constructor() {
        super('MainGameScene');
        this.isGrappling = false; this.activeGrapplePick = null;
        this.WARNING_DISTANCE = 280; this.HEAVY_FLY_LIMIT = 214;
        this.CRITICAL_DISTANCE = 380; this.RETRACT_DELAY = 1000;
        this.lastDashTime = 0; this.dashCooldown = 0;
        this.isDashing = false; this.dashDuration = 120; this.dashSpeed = 1600;
        this.ropeNodes1 = []; this.ropeNodes2 = [];
        this.ropeLength1 = 0; this.ropeLength2 = 0; this.wallRects = [];
        this.activeStart1 = 0; this.activeEnd1 = 14;
        this.activeStart2 = 0; this.activeEnd2 = 14;
        this.dropTimer1 = null; this.dropTimer2 = null;
        this.retractTimer1 = null; this.retractTimer2 = null;
        this.isMeleeAttacking = false; this.meleeAttackFlipX = false;
        this.isPlayerStunned = false; this.isPlayerInvincible = false;
        this.meleeCooldown = 0;

        this.isDead = false;
        this.spawnX = 800;
        this.spawnY = 250;
    }

    preload() {
        // (用户) 场景重启脏状态复位 — Phaser 场景实例跨 start/shutdown 存活:
        // Save&Exit / 存档点退出留下的 物理暂停/时钟暂停/死亡标记 不清掉, 重进时
        // 开场黑幕的 delayedCall 永远不触发 = 黑屏, 物理冻结 = 全场不动. (SZ/Tutorial 都走 super.preload)
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
        // (用户修复) 'none' 从 init 挪到 create 末尾精灵就位时 — init 就切掉的话, create 冻结黑屏期 (StartIntro→Tutorial
        //   这种没有 Loading 层兜底的路径) 鼠标会整段消失; 冻结期沿用上个场景留下的 CSS 光标
        // (用户) 清掉上一轮残留的显示对象/数组缓存 — lazy 守卫 (if (!this.x)) 第二轮判真跳过重建,
        // 拿已销毁对象继续用 = 重进崩溃; 数组里囤的死对象同理
        this.ropeGraphics = null; this._gridCoordText = null;
        this._pickExtraWalls = null; this._thorns = null;
        this._crystalOres = null; this._deathFragments = null;
        this._currentCamBoundsKey = null;   // (用户) 重进场景必须清 — 否则 _updateChunkCamera 以为边界没变, 跳过 setBounds, 新摄像机永远无界
        this._cpSnapDone = null;   // (用户) checkpoint 快照集合 — 每次 create 重置 (每个 checkpoint 每局首次进圈记一次)
        this._achDiedHere = false; this._achNestBroken = false;   // (用户成就) 区内死亡/巢破坏标记每局重置
        this.uiCam = null; this.pick1 = null; this.pick2 = null;
        this.mobWalls = null; this.playerWalls = null;   // (用户) 懒建组字段 — 死组残留是重进崩溃的元凶 (MobWall children.set)   // (用户) uiCam 在 create 末段才重建, 早段读到旧轮死相机; pick 同理 (墙注册早于稿子重建时拿死稿子挂碰撞器)
        if (typeof AudioSystem !== 'undefined') AudioSystem.loadAll(this);  // 加载全部音频
        if (typeof CrystalNpc !== 'undefined' && CrystalNpc.loadAnimSheets) CrystalNpc.loadAnimSheets(this);  // 加载 CNPC 动画
        // 静默处理资源加载失败（不在 console 显示 404 红字）
        this.load.on('loaderror', (file) => {
            // 只 log warn，不抛错; 音频缺失 AudioSystem 已有汇总日志, 这里跳过防重复刷屏
            if (file && file.type === 'audio') return;
            console.warn('[Asset 404]', file.key, file.url);
        });
        this.load.spritesheet('Miner_stand','assets/images/Miner_stand.png',{frameWidth:128,frameHeight:128});
        this.load.spritesheet('Miner_stand_up','assets/images/Miner_stand_up.png',{frameWidth:164,frameHeight:116});
        this.load.spritesheet('Miner_dash','assets/images/Miner_dash.png',{frameWidth:160,frameHeight:80});   // (用户) 新冲刺图 640×80 / 4 帧
        this.load.spritesheet('melee_attack_slash','assets/images/melee_attack_slash.png',{frameWidth:256,frameHeight:256});
        this.load.spritesheet('Miner_run','assets/images/Miner_run.png',{frameWidth:128,frameHeight:128});
        this.load.spritesheet('Miner_melee_attack','assets/images/Miner_melee_attack.png',{frameWidth:192,frameHeight:128});
        this.load.spritesheet('Miner_jump','assets/images/Miner_jump.png',{frameWidth:128,frameHeight:128});
        this.load.spritesheet('Miner_fall','assets/images/Miner_fall.png',{frameWidth:128,frameHeight:128});
        this.load.spritesheet('Miner_crouch','assets/images/Miner_crouch.png',{frameWidth:128,frameHeight:128});
        this.load.spritesheet('Miner_crouch_walk','assets/images/Miner_crouch_walk.png',{frameWidth:128,frameHeight:128});
        this.load.image('Trader_interection_icon', 'assets/images/Trader_interection_icon.png');
        this.load.spritesheet('Trader_stand', 'assets/images/Trader_stand.png', { frameWidth: 48, frameHeight: 48 });
        this.load.image('Crystal', 'assets/images/Crystal.png');
        this.load.image('YCrystal', 'assets/images/YCrystal.png');
        this.load.image('Crystal_block_1', 'assets/images/Crystal_block_1.png');
        this.load.image('Crystal_block_2', 'assets/images/Crystal_block_2.png');
        this.load.image('Crystal_block_3', 'assets/images/Crystal_block_3.png');
        this.load.image('YCrystal_block_1', 'assets/images/YCrystal_block_1.png');
        this.load.image('YCrystal_block_2', 'assets/images/YCrystal_block_2.png');
        this.load.image('YCrystal_block_3', 'assets/images/YCrystal_block_3.png');
        this.load.spritesheet('Mimic_ore_run', 'assets/images/Mimic_ore_run.png', { frameWidth: 32, frameHeight: 32 });

        // 小蜘蛛动画（每帧 64x64，帧数见名）
        this.load.spritesheet('Small_spider_run',     'assets/images/Small_spider_run.png',     { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('Small_spider_attack',  'assets/images/Small_spider_attack.png',  { frameWidth: 64, frameHeight: 64 });
        // (用户) 素材缺失暂停加载, 文件补进 assets 后解开: this.load.spritesheet('Small_spider_injured', 'assets/images/Small_spider_injured.png', { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('Small_spider_dead',    'assets/images/Small_spider_dead.png',    { frameWidth: 64, frameHeight: 64 });
        this.load.spritesheet('Small_spider_fall',    'assets/images/Small_spider_fall.png',    { frameWidth: 64, frameHeight: 64 });

        // 史莱姆动画
        this.load.spritesheet('Slime_dead',     'assets/images/Slime_dead.png',     { frameWidth: 32, frameHeight: 32 });  // 96x32 / 3 frames
        this.load.spritesheet('Slime_injuried', 'assets/images/Slime_injuried.png', { frameWidth: 32, frameHeight: 32 });  // 64x32 / 2 frames
        this.load.spritesheet('Slime_jump',     'assets/images/Slime_jump.png',     { frameWidth: 32, frameHeight: 32 });  // 32x96 / 3 frames（垂直）
        this.load.spritesheet('Slime_fall',     'assets/images/Slime_fall.png',     { frameWidth: 32, frameHeight: 32 });  // 128x32 / 4 frames
        this.load.spritesheet('Slime_attack',   'assets/images/Slime_attack.png',   { frameWidth: 32, frameHeight: 32 });  // 96x32 / 3 frames

        // === Monster spritesheets (frameWidth/Height 都是 32) ===
        // Bat (5 anims)
        this.load.spritesheet('Bat_idle',     'assets/images/Bat_idle.png',     { frameWidth: 32, frameHeight: 32 });  // 128x32 / 4 frames
        this.load.spritesheet('Bat_fly',      'assets/images/Bat_fly.png',      { frameWidth: 32, frameHeight: 32 });  // 128x32 / 4 frames
        this.load.spritesheet('Bat_attack',   'assets/images/Bat_attack.png',   { frameWidth: 32, frameHeight: 32 });  // 96x32 / 3 frames
        this.load.spritesheet('Bat_injuried', 'assets/images/Bat_injuried.png', { frameWidth: 32, frameHeight: 32 });  // 64x32 / 2 frames
        this.load.spritesheet('Bat_dead',     'assets/images/Bat_dead.png',     { frameWidth: 32, frameHeight: 32 });  // 96x32 / 3 frames
        // Beetle (5 anims)
        this.load.spritesheet('Beetle_idle',     'assets/images/Beetle_idle.png',     { frameWidth: 32, frameHeight: 32 });  // 128x32 / 4 frames
        this.load.spritesheet('Beetle_run',      'assets/images/Beetle_run.png',      { frameWidth: 32, frameHeight: 32 });  // 192x32 / 6 frames
        this.load.spritesheet('Beetle_attack',   'assets/images/Beetle_attack.png',   { frameWidth: 32, frameHeight: 32 });  // 192x32 / 6 frames
        this.load.spritesheet('Beetle_injuried', 'assets/images/Beetle_injuried.png', { frameWidth: 32, frameHeight: 32 });  // 96x32 / 3 frames
        this.load.spritesheet('Beetle_dead',     'assets/images/Beetle_dead.png',     { frameWidth: 32, frameHeight: 32 });  // 128x32 / 4 frames
        // VolatileCrystal (5 anims)
        this.load.spritesheet('VolatileCrystal_idle',     'assets/images/VolatileCrystal_idle.png',     { frameWidth: 32, frameHeight: 32 });  // 128x32 / 4 frames
        this.load.spritesheet('VolatileCrystal_charge',   'assets/images/VolatileCrystal_charge.png',   { frameWidth: 32, frameHeight: 32 });  // 160x32 / 5 frames
        this.load.spritesheet('VolatileCrystal_explode',  'assets/images/VolatileCrystal_explode.png',  { frameWidth: 32, frameHeight: 32 });  // 160x32 / 5 frames
        this.load.spritesheet('VolatileCrystal_injuried', 'assets/images/VolatileCrystal_injuried.png', { frameWidth: 32, frameHeight: 32 });  // 64x32 / 2 frames
        this.load.spritesheet('VolatileCrystal_dead',     'assets/images/VolatileCrystal_dead.png',     { frameWidth: 32, frameHeight: 32 });  // 128x32 / 4 frames
        // EarthWorm (6 anims)
        this.load.spritesheet('EarthWorm_idle',     'assets/images/EarthWorm_idle.png',     { frameWidth: 32, frameHeight: 32 });  // 128x32 / 4 frames
        this.load.spritesheet('EarthWorm_move',     'assets/images/EarthWorm_move.png',     { frameWidth: 32, frameHeight: 32 });  // 192x32 / 6 frames
        this.load.spritesheet('EarthWorm_pop_up',   'assets/images/EarthWorm_pop_up.png',   { frameWidth: 32, frameHeight: 32 });  // 128x32 / 4 frames
        this.load.spritesheet('EarthWorm_attack',   'assets/images/EarthWorm_attack.png',   { frameWidth: 32, frameHeight: 32 });  // 96x32 / 3 frames
        this.load.spritesheet('EarthWorm_injuried', 'assets/images/EarthWorm_injuried.png', { frameWidth: 32, frameHeight: 32 });  // 64x32 / 2 frames
        this.load.spritesheet('EarthWorm_dead',     'assets/images/EarthWorm_dead.png',     { frameWidth: 32, frameHeight: 32 });  // 96x32 / 3 frames

        // Checkpoint 神像
        this.load.image('Checkpoint_unactivated', 'assets/images/Checkpoint_unactivated.png');  // 96x128 单帧
        this.load.spritesheet('Checkpoint_activating', 'assets/images/Checkpoint_activating.png', { frameWidth: 192, frameHeight: 160 });  // 4224x160 / 22 帧
        this.load.spritesheet('Checkpoint_activated',  'assets/images/Checkpoint_activated.png',  { frameWidth: 192, frameHeight: 160 });  // 4032x160 / 21 帧
        // Cavetile 墙壁皮肤
        this.load.image('Cavetile_wall_2L',   'assets/images/Cavetile_wall_2L.png');
        this.load.image('Cavetile_wall_T',    'assets/images/Cavetile_wall_T.png');
        this.load.image('Cavetile_wall_TB',   'assets/images/Cavetile_wall_TB.png');
        this.load.image('Cavetile_wall_TR',   'assets/images/Cavetile_wall_TR.png');
        this.load.image('Cavetile_wall_TRB',  'assets/images/Cavetile_wall_TRB.png');
        this.load.image('Cavetile_wall_TRBL', 'assets/images/Cavetile_wall_TRBL.png');
        this.load.image('Cavetile_wall_3L1',  'assets/images/Cavetile_wall_3L1.png');
        this.load.image('Cavetile_wall_3L2',  'assets/images/Cavetile_wall_3L2.png');
        this.load.image('Cavetile_wall_3L3',  'assets/images/Cavetile_wall_3L3.png');
        this.load.image('Cavetile_wall_3LC1', 'assets/images/Cavetile_wall_3LC1.png');
        this.load.image('Cavetile_wall_3LC2', 'assets/images/Cavetile_wall_3LC2.png');
        this.load.image('Cavetile_wall_3LC3', 'assets/images/Cavetile_wall_3LC3.png');
        this.load.image('Cavetile_wall_5LC1', 'assets/images/Cavetile_wall_5LC1.png');
        this.load.image('Cavetile_wall_5LC2', 'assets/images/Cavetile_wall_5LC2.png');
        this.load.image('Cavetile_wall_5LC3', 'assets/images/Cavetile_wall_5LC3.png');
        // Yellow_dirt 皮肤（与 Cavetile 同套，激活 checkpoint 后使用）
        const ydSuffixes = ['2L', '3L1', '3L2', '3L3', '3LC1', '3LC2', '3LC3', '5LC1', '5LC2', '5LC3', 'T', 'TR', 'TB', 'TRB', 'TRBL'];
        // (用户) 'grass', 'grass_T' 两张素材缺失暂摘 (Yellow_dirt_grass.png / Yellow_dirt_grass_T.png 补进 assets/images 后加回数组即可)
        ydSuffixes.forEach(s => {
            this.load.image('Yellow_dirt_' + s, 'assets/images/Yellow_dirt_' + s + '.png');
        });
        this.load.image('Background_block', 'assets/images/Background_block.png');
        this.load.image('Secret_door',      'assets/images/Secret_door.png');
        // 平台 4 张皮肤
        this.load.image('Platform_M',  'assets/images/Platform_M.png');
        this.load.image('Platform_L',  'assets/images/Platform_L.png');
        this.load.image('Platform_R',  'assets/images/Platform_R.png');
        this.load.image('Platform_LR', 'assets/images/Platform_LR.png');
        this.load.image('Mouse_cursor', 'assets/images/Mouse_cursor.png');
        this.load.image('MouseCursor_Left', 'assets/images/MouseCursor_Left.png');     // (用户) 解锁双手后左手光标
        this.load.image('MouseCursor_Right', 'assets/images/MouseCursor_Right.png');   // (用户) 解锁双手后右手光标
        // Hint sprite (112x16, 7 frames)
        this.load.spritesheet('Hint', 'assets/images/Hint.png', { frameWidth: 16, frameHeight: 16 });
        // Key door 资源 (用户上传后自动加载)
        this.load.image('Key_door_locked',   'assets/images/Key_door_locked.png');
        this.load.image('Key_door_unlocked', 'assets/images/Key_door_unlocked.png');
        this.load.spritesheet('Key_door_unlocking', 'assets/images/Key_door_unlocking.png', { frameWidth: 96, frameHeight: 96 });
        this.load.spritesheet('Key_door_open',      'assets/images/Key_door_open.png', { frameWidth: 96, frameHeight: 96 });
        // Crystal door
        this.load.image('Crystal_door_locked', 'assets/images/Crystal_door_locked.png');
        this.load.spritesheet('Crystal_door_open', 'assets/images/Crystal_door_open.png', { frameWidth: 64, frameHeight: 96 });
        // Key item icon
        this.load.image('key_img', 'assets/images/YellowKey.png');   // (用户) 黄钥匙 32×32 (快捷栏/背包/商店共用 key_img)
        // Corpse 装饰
        this.load.image('Corpse1', 'assets/images/Corpse1.png');
        this.load.image('Corpse2', 'assets/images/Corpse2.png');
        this.load.image('Corpse3', 'assets/images/Corpse3.png');
        // Chest 宝箱 (阶段 1+2)
        // Chest_close: 45×39 单帧
        // Chest_open: 360×39 = 8 帧 × 45 宽
        this.load.image('Chest_close', 'assets/images/Chest_close.png');
        this.load.spritesheet('Chest_open', 'assets/images/Chest_open.png', { frameWidth: 45, frameHeight: 39 });
        // Trader 钻地动画 (Tutorial + SZ2 商人剧情共用)
        this.load.spritesheet('Trader_dig', 'assets/images/Trader_dig.png', { frameWidth: 64, frameHeight: 64 });

        // === Golem (SZ2 Boss) 资源 ===
        // 身体 / sleep / wake
        this.load.image('G_sleep', 'assets/images/G_sleep.png');                                                   // 96×80
        this.load.spritesheet('G_wake', 'assets/images/G_wake.png', { frameWidth: 288, frameHeight: 128 });        // 8928×128, 31 帧
        // 手 (右侧 — 左手用 flipX 翻转)
        this.load.image('GHand_palmR', 'assets/images/GHand_palmR.png');                                            // 160×160
        this.load.spritesheet('GHand_palmR_swipe', 'assets/images/GHand_palmR_swipe.png', { frameWidth: 160, frameHeight: 160 });  // 800×160, 5 帧
        this.load.image('GHand_rockR', 'assets/images/GHand_rockR.png');                                            // 160×160
        this.load.spritesheet('GHand_rockR_smash', 'assets/images/GHand_rockR_smash.png', { frameWidth: 160, frameHeight: 160 });  // 800×160, 5 帧
        // 头 (5 张眼部图片 - 跟玩家 X 位置)
        this.load.image('GHead_eyeL2', 'assets/images/GHead_eyeL2.png');                                            // 96×128
        this.load.image('GHead_eyeL1', 'assets/images/GHead_eyeL1.png');                                            // 96×128
        this.load.image('GHead_eyeM',  'assets/images/GHead_eyeM.png');                                             // 96×128
        this.load.image('GHead_eyeR1', 'assets/images/GHead_eyeR1.png');                                            // 96×128
        this.load.image('GHead_eyeR2', 'assets/images/GHead_eyeR2.png');                                            // 96×128
        // 嘴 (落地召唤 beetle 时用) — 768×128, 8 帧 (每帧 96×128)
        this.load.spritesheet('GMouth', 'assets/images/GMouth.png', { frameWidth: 96, frameHeight: 128 });

        // === 用户新增素材 (SZ3 NPC / 道具 / 钟乳石 / 稿子) — 均用新 key, 不与生成贴图冲突 ===
        // SZ3 丢失玩具 NPC
        this.load.spritesheet('Crying_guy_cry',   'assets/images/Crying_guy_cry.png',   { frameWidth: 64, frameHeight: 64 });  // 1088×64 / 17 帧
        this.load.spritesheet('Crying_guy_happy', 'assets/images/Crying_guy_happy.png', { frameWidth: 64, frameHeight: 64 });  // 384×64 / 6 帧
        // SZ3 keydoor 旁守门人 NPC
        this.load.spritesheet('Gatekeeper_Idle',  'assets/images/Gatekeeper_Idle.png',  { frameWidth: 64, frameHeight: 64 });  // 384×64 / 6 帧
        // SZ2 水晶族 NPC (坐着的疲惫者, 原图朝左 = 符合默认约定)
        this.load.spritesheet('Tired_guy_sit',    'assets/images/Tired_guy_sit.png',    { frameWidth: 64, frameHeight: 64 });  // 1088×64 / 17 帧
        // 道具图标
        this.load.image('HpPotion', 'assets/images/HpPotion.png');   // 32×32
        this.load.image('potion_health_img', 'assets/images/HealthPotion.png');     // (用户) Health Potion 32×32 (商店+快捷栏)
        this.load.image('potion_life_img', 'assets/images/LifePotion.png');         // (用户) Life+ Potion 32×32 (商店)
        this.load.image('health_detector_img', 'assets/images/HealthDetector.png'); // (用户) Health Detector 32×32 (商店)
        this.load.image('Heart', 'assets/images/Heart.png');                        // (用户) 爱心 32×32 (HP 条右侧 + 死亡画面)
        this.load.spritesheet('HeartBreak', 'assets/images/HeartBreak.png', { frameWidth: 32, frameHeight: 32 });   // (用户) 352×32 / 11 帧 死亡爱心碎裂
        this.load.image('Thorns', 'assets/images/Thorns.png');                      // (用户) 荆棘 32×32 (Thorns.js 已 exists 检查)
        this.load.spritesheet('Thorns_move', 'assets/images/Thorns_move.png', { frameWidth: 32, frameHeight: 32 });   // (用户) 荆棘被碰动画 320×32/10帧
        this.load.image('BatNest', 'assets/images/Bat_nest.png');                   // (用户) 蝙蝠巢 60×24 (BatNest.js 用原生尺寸, 血条/打击随 displaySize 自适应)
        this.load.spritesheet('Bat_boss_fly', 'assets/images/Bat_boss_fly.png', { frameWidth: 144, frameHeight: 112 });    // (用户) 1008×112 / 7 帧
        this.load.spritesheet('Bat_boss_dash', 'assets/images/Bat_boss_dash.png', { frameWidth: 144, frameHeight: 112 });  // (用户) 1008×112 / 7 帧
        this.load.spritesheet('Bat_boss_roar', 'assets/images/Bat_boss_roar.png', { frameWidth: 144, frameHeight: 112 });  // (用户) 新版 2160×112 / 15 帧 — 帧数 frameTotal 自适应, 换图即生效
        this.load.spritesheet('Bat_boss_wakes_up', 'assets/images/Bat_boss_wakes_up.png', { frameWidth: 144, frameHeight: 112 });  // (用户) 2160×112 / 15 帧 — 剧情苏醒
        this.load.spritesheet('Bat_boss_dead', 'assets/images/Bat_boss_dead.png', { frameWidth: 144, frameHeight: 112 });          // (用户) 4464×112 / 31 帧 — 坠地死亡, 播完消失
        this.load.image('Bat_boss_avatar', 'assets/images/Bat_boss_avatar.png');   // (用户) 144×112 — boss 介绍横幅头像
        this.load.spritesheet('Miner_dead', 'assets/images/Miner_dead.png', { frameWidth: 128, frameHeight: 128 });                // (用户) 896×128 / 7 帧 — 玩家死亡
        this.load.image('Corrosion', 'assets/images/Corrosion.png');             // (用户) 腐蚀条框 108×14
        this.load.image('Corrosion_Fill', 'assets/images/Corrosion_Fill.png');   // (用户) 腐蚀条填充 100×5
        this.load.image('HpBar', 'assets/images/HpBar.png');                     // (用户) 血条框 108×14
        this.load.image('HpBar_Fill', 'assets/images/HpBar_Fill.png');           // (用户) 血条填充 100×5
        this.load.image('Setting',  'assets/images/Setting.png');    // 32×32
        // 稿子 (替换黄块)
        this.load.image('Pickaxe',  'assets/images/Pickaxe.png');    // 32×32
        // 钟乳石方块 (3 种, 首次加载随机选一种永久用) + 落地碎裂动画
        // (用户) 素材缺失暂停加载 (不在 19 图清单, 404; 有图后解开): this.load.image('Stalactite1', 'assets/images/Stalactite1.png');  // 24×24
        this.load.image('Stalactite2', 'assets/images/Stalactite2.png');  // 24×24
        this.load.image('Stalactite3', 'assets/images/Stalactite3.png');  // 24×24
        // (用户) 素材缺失暂停加载 (不在 19 图清单, 404; 有图后解开): this.load.spritesheet('Stalactite1_shatter', 'assets/images/Stalactite1_shatter.png', { frameWidth: 28, frameHeight: 24 });  // 168×24 / 6 帧
        this.load.spritesheet('Stalactite2_shatter', 'assets/images/Stalactite2_shatter.png', { frameWidth: 28, frameHeight: 24 });  // 168×24 / 6 帧
        this.load.spritesheet('Stalactite3_shatter', 'assets/images/Stalactite3_shatter.png', { frameWidth: 28, frameHeight: 24 });  // 168×24 / 6 帧
        this.load.spritesheet('Stalactite1_drop', 'assets/images/Stalactite1_drop.png', { frameWidth: 24, frameHeight: 48 });   // (用户) 120×48 / 5 帧 下落动画 (与变体 1 配对)
        this.load.spritesheet('Stalactite2_drop', 'assets/images/Stalactite2_drop.png', { frameWidth: 24, frameHeight: 48 });   // (用户) 变体 2 配对
        this.load.spritesheet('Stalactite3_drop', 'assets/images/Stalactite3_drop.png', { frameWidth: 24, frameHeight: 48 });   // (用户) 变体 3 配对
        // 石门 6 张 (原只在 Tutorial 加载 → guide 石堆演示在其它场景没皮肤; 移入共享预载, Boot 后全场景可用)
        this.load.image('Stone_door_perfect',     'assets/images/Stone_door_perfect.png');
        this.load.image('Stone_door_small_crack', 'assets/images/Stone_door_small_crack.png');
        this.load.image('Stone_door_more_crack',  'assets/images/Stone_door_more_crack.png');
        this.load.image('Stone_door_injuried',    'assets/images/Stone_door_injuried.png');
        this.load.spritesheet('Stone_door_breaking', 'assets/images/Stone_door_breaking.png', { frameWidth: 96, frameHeight: 96 });
        this.load.image('Stone_door_residue',     'assets/images/Stone_door_residue.png');

        // 程序化生成所有像素贴图
        TextureGenerator.generateAll(this);
    }

    create() {

        // pickaxeUpgraded — 从 registry 读 (跨场景有效, 刷新网页自动重置 — 暂无后台存档)
        this._pickaxeUpgraded = !!this.registry.get('pickaxeUpgraded');
        // 核心子系统
        this.ropePhysics   = new RopePhysics(this);
        this.dashSystem    = new DashSystem(this);
        this.movementSystem= new MovementSystem(this);
        this.throwSystem   = new ThrowSystem(this);
        this.grappleSystem = new GrappleSystem(this);
        this.recallSystem  = new RecallSystem(this);
        this.meleeSystem   = new MeleeSystem(this);

        this.input.mouse.disableContextMenu();
        this.anims.create({key:'idle',frames:this.anims.generateFrameNumbers('Miner_stand',{start:0,end:11}),frameRate:12,repeat:-1});
        // 起身动画（30 帧，不循环 — 落地剧情用）
        if (this.textures.exists('Miner_stand_up')) {
            this.anims.create({key:'stand_up', frames:this.anims.generateFrameNumbers('Miner_stand_up', {start:0, end:29}), frameRate:7.5, repeat:0});
        }
        // Miner_dash 动画
        if (this.textures.exists('Miner_dash')) {
            this.anims.create({key:'dash', frames:this.anims.generateFrameNumbers('Miner_dash', {start:0, end:3}), frameRate:24, repeat:0});
        }
        if (this.textures.exists('melee_attack_slash')) {
            this.anims.create({key:'melee_attack_slash', frames:this.anims.generateFrameNumbers('melee_attack_slash', {start:0, end:4}), frameRate:24, repeat:0});
        }
        this.anims.create({key:'run', frames:this.anims.generateFrameNumbers('Miner_run',  {start:0,end:5 }),frameRate:12,repeat:-1});
        // 近战动画：仅在 spritesheet 成功加载时注册（防止 png 404 时崩溃）
        if (this.textures.exists('Miner_melee_attack')) {
            this.anims.create({key:'melee_attack', frames:this.anims.generateFrameNumbers('Miner_melee_attack', {start:0, end:2}), frameRate:20, repeat:0});
        } else {
            console.warn('[GameScene] Miner_melee_attack texture missing, melee animation disabled');
        }
        // 跳跃动画（3 帧，不循环，跳起时一次性播完）
        if (this.textures.exists('Miner_jump')) {
            this.anims.create({key:'jump', frames:this.anims.generateFrameNumbers('Miner_jump', {start:0, end:2}), frameRate:14, repeat:0});
        }
        // 下落动画（3 帧，循环播放最后一帧的状态）
        if (this.textures.exists('Miner_fall')) {
            this.anims.create({key:'fall', frames:this.anims.generateFrameNumbers('Miner_fall', {start:0, end:2}), frameRate:10, repeat:0});
        }
        // 蹲下动画（6 帧，第 1 次播放是"蹲下过渡"动画，循环不需要 - 蹲住时停在最后一帧）
        if (this.textures.exists('Miner_crouch')) {
            this.anims.create({key:'crouch', frames:this.anims.generateFrameNumbers('Miner_crouch', {start:0, end:5}), frameRate:14, repeat:0});
        }
        // 蹲下移动动画（10 帧循环）
        if (this.textures.exists('Miner_crouch_walk')) {
            this.anims.create({key:'crouch_walk', frames:this.anims.generateFrameNumbers('Miner_crouch_walk', {start:0, end:9}), frameRate:14, repeat:-1});
        }
        if (this.textures.exists('Trader_stand') && !this.anims.exists('trader_stand')) {
            this.anims.create({key:'trader_stand', frames:this.anims.generateFrameNumbers('Trader_stand', {start:0, end:5}), frameRate:8, repeat:-1});
        }
        if (this.textures.exists('Mimic_ore_run') && !this.anims.exists('mimic_ore_run')) {
            const t = this.textures.get('Mimic_ore_run');
            const total = t.frameTotal - 2;   // (用户) frameTotal 含 __BASE 基帧, -1 会多出一帧 → "Frame N not found"
            this.anims.create({key:'mimic_ore_run', frames:this.anims.generateFrameNumbers('Mimic_ore_run', {start:0, end:total > 0 ? total : 0}), frameRate:10, repeat:-1});
        }

        // 小蜘蛛动画
        if (this.textures.exists('Small_spider_run')) {
            this.anims.create({ key: 'small_spider_run', frames: this.anims.generateFrameNumbers('Small_spider_run', { start: 0, end: 3 }), frameRate: 12, repeat: -1 });
        }

        // === 钟乳石碎裂动画 (SZ3 NPC 动画由 CrystalNpc.ANIM_CATALOG 注册) ===
        for (let i = 1; i <= 3; i++) {
            const tex = 'Stalactite' + i + '_shatter', key = 'stalactite' + i + '_shatter';
            if (this.textures.exists(tex) && !this.anims.exists(key)) {
                this.anims.create({ key: key, frames: this.anims.generateFrameNumbers(tex, { start: 0, end: 5 }), frameRate: 15, repeat: 0 });
            }
            const dTex = 'Stalactite' + i + '_drop', dKey = 'stalactite' + i + '_drop';   // (用户) 配对下落动画 24×48 / 5 帧
            if (this.textures.exists(dTex) && !this.anims.exists(dKey)) {
                this.anims.create({ key: dKey, frames: this.anims.generateFrameNumbers(dTex, { start: 0, end: 4 }), frameRate: 12, repeat: -1 });
            }
        }
        // (用户) 死亡爱心碎裂动画 (HeartBreak 352×32 / 11 帧; 帧数 frameTotal 自适应)
        if (this.textures.exists('HeartBreak') && !this.anims.exists('heart_break')) {
            const _hb = this.textures.get('HeartBreak');
            this.anims.create({ key: 'heart_break', frames: this.anims.generateFrameNumbers('HeartBreak', { start: 0, end: Math.max(0, _hb.frameTotal - 2) }), frameRate: 18, repeat: 0 });
        }
        if (this.textures.exists('Small_spider_attack')) {
            this.anims.create({ key: 'small_spider_attack', frames: this.anims.generateFrameNumbers('Small_spider_attack', { start: 0, end: 2 }), frameRate: 14, repeat: 0 });
        }
        if (this.textures.exists('Small_spider_injured')) {
            this.anims.create({ key: 'small_spider_injured', frames: this.anims.generateFrameNumbers('Small_spider_injured', { start: 0, end: 1 }), frameRate: 12, repeat: 0 });
        }
        if (this.textures.exists('Small_spider_dead')) {
            this.anims.create({ key: 'small_spider_dead', frames: this.anims.generateFrameNumbers('Small_spider_dead', { start: 0, end: 0 }), frameRate: 1, repeat: 0 });
        }
        if (this.textures.exists('Small_spider_fall')) {
            this.anims.create({ key: 'small_spider_fall', frames: this.anims.generateFrameNumbers('Small_spider_fall', { start: 0, end: 2 }), frameRate: 12, repeat: -1 });
        }

        // === 怪物动画 (Bat / Beetle / VolatileCrystal / EarthWorm) ===
        this._registerMonsterAnims();
        // === Golem (SZ2 Boss) 动画 ===
        this._registerGolemAnims();

        // ===== 新按键映射：SPACE=跳 / S=蹲 / F=换手 / SHIFT=冲刺 =====
        this.keyJump   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.keyCrouch = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        this.keyF      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
        this.keyShift  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        this.keyR      = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
        this.keyESC    = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
        // Z / X / C / B 由 BackpackSystem._registerKeys() 注册

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

        this.isCrouching = false; this.isHanging = false;

        this.physics.world.setBounds(0, 0, 3200, 1800);
        this.walls = this.physics.add.staticGroup();
        this.wallRects = [];
        this.gridSystem = new GridSystem(this, 32, 3200, 1800);
        // (用户) 光影黑雾 — 基类统一创建: 主矿洞 + T2/T3 (经 super.create) 都从这里获得
        if (typeof FogSystem !== 'undefined' && this.gridSystem) {
            const _fg = this.gridSystem;
            this.fogSystem = new FogSystem(this, _fg.cellSize, _fg.cols * _fg.cellSize, _fg.rows * _fg.cellSize, _fg.originX || 0, _fg.originY || 0);
        }
        this.spawnPoints = [];

        // 怪物 groups
        this.spiders          = this.physics.add.group();
        this.bungeeSpiders    = this.physics.add.group({ allowGravity: false });
        this.bats             = this.physics.add.group({ allowGravity: false });
        this.earthworms       = this.physics.add.group();
        this.slimes           = this.physics.add.group();
        this.miniSlimes       = this.physics.add.group();
        this.beetles          = this.physics.add.group();
        this.volatileCrystals = this.physics.add.group();
        this.mimicOres        = this.physics.add.group();
        this.cowardMimics     = this.physics.add.group();

        // === 生成地形 + NPC + 怪物 (SpawnConfig.js) ===
        SpawnConfig.setup(this);

        // 玩家
        this.player = new Player(this, this.spawnX, this.spawnY);
        this.physics.add.collider(this.player, this.walls);
        this.player.body.setMaxVelocity(3000, 3000);

        // 相机
        this.cameraSystem = new CameraSystem(this.cameras.main, this.player);
        this.cameraSystem.setup(3200, 1800);
        this.cameras.main.setZoom(2);

        // 背包（兼容旧 inv 变量）
        this.inv = { left: true, right: true };

        // 铁镐
        this.pick1 = new Pickaxe(this, 0, 0);
        this.pick2 = new Pickaxe(this, 0, 0);
        this.pick1.setCollideWorldBounds(true);
        this.pick2.setCollideWorldBounds(true);
        this.physics.add.collider(this.pick1, this.walls, () => this.handlePickCollide(this.pick1, 1));
        this.physics.add.collider(this.pick2, this.walls, () => this.handlePickCollide(this.pick2, 2));
        // (用户) 已登记的空气墙 → 稿子碰撞器 (空气墙对稿子 = 真墙; 处理"墙先建/稿子后建"的顺序)
        if (this._pickExtraWalls) this._pickExtraWalls.forEach(w => this._addPickWallCollider(w));

        for (let i = 0; i < 15; i++) {
            this.ropeNodes1.push({x:0,y:0,ox:0,oy:0});
            this.ropeNodes2.push({x:0,y:0,ox:0,oy:0});
        }
        this.physics.add.overlap(this.player, [this.pick1, this.pick2], (p, pick) => {
            if (pick.state === 'dropped' || pick.state === 'returning') this.recallSystem.doCollect(pick);
        });

        // 水晶掉落
        this.droppedCrystals = this.physics.add.group();
        this.physics.add.collider(this.droppedCrystals, this.walls);

        // === 新系统初始化 ===
        this.healthSystem    = new HealthSystem(this);    this.healthSystem.init();
        this.inventorySystem = new BackpackSystem(this); this.inventorySystem.init();
        this.backpackSystem  = this.inventorySystem;
        this.hudSystem       = new HUDSystem(this);       this.hudSystem.init();
        if (typeof AudioSystem !== 'undefined') AudioSystem.bgm(this, 'bgm_Cave');  // (用户) 主矿洞 BGM (Cave.mp3)
        this.settingsSystem  = new SettingsSystem(this);  this.settingsSystem.init();
        this.creativeSystem  = new CreativeSystem(this);  this.creativeSystem.init();
        this.dialogSystem    = new DialogSystem(this);    this.dialogSystem.init();
        this.questSystem     = new QuestSystem(this);     this.questSystem.init();
        this.guideSystem     = new GuideSystem(this);     this.guideSystem.init();
        this.shopSystem      = new ShopSystem(this);      this.shopSystem.init();
        this.interactSystem  = new InteractSystem(this);  this.interactSystem.init();

        // 怪物掉落监听（使用 HUDSystem）
        this.events.on('monster_killed', (mx, my, dropRate) => {
            if (Math.random() <= dropRate) {
                // 随机落地点：以 (mx, my) 为中心，半径 30 内
                const angle = Math.random() * Math.PI * 2;
                const radius = 5 + Math.random() * 10;  // 5~15（小一点不出墙）
                let targetX = mx + Math.cos(angle) * radius;
                let targetY = my + Math.sin(angle) * radius;
                // 防穿模 + 一定落地 — raycast 向下找 floor:
                // 没 floor → drop 回怪物原位; 有 floor → 总是钉到 floor 顶上
                if (this.wallRects) {
                    // (用户) 贴墙穿模修复 ①: 落点 X 若伸进同高度侧墙体内 → 先水平挤出 (水晶半宽 10)
                    for (const w of this.wallRects) {
                        if (w.bottom > my - 14 && w.top < my + 14 && targetX > w.left - 10 && targetX < w.right + 10) {
                            targetX = (mx <= (w.left + w.right) / 2) ? w.left - 10 : w.right + 10;
                        }
                    }
                    let nearestFloorY = Infinity;
                    for (const w of this.wallRects) {
                        if (targetX >= w.left && targetX <= w.right && w.top >= my - 4) {
                            if (w.top < nearestFloorY) nearestFloorY = w.top;
                        }
                    }
                    if (nearestFloorY === Infinity) {
                        // 该 X 列没 floor — drop 回原位 (怪物死的地方)
                        targetX = mx;
                        targetY = my;
                    } else {
                        // 找到 floor → 钉 floor 顶, 半高 10 + 2px 余量 (原 -4 会嵌进地里 6px)
                        targetY = nearestFloorY - 12;
                    }
                    // (用户) 贴墙穿模修复 ②: 最终位置仍与任何墙重叠 → 回方块原位 (刚打掉的格子必为空气)
                    for (const w of this.wallRects) {
                        if (targetX > w.left - 10 && targetX < w.right + 10 && targetY > w.top - 10 && targetY < w.bottom + 10) {
                            targetX = mx; targetY = my; break;
                        }
                    }
                }

                // 创建水晶 sprite — 优先用 Crystal 纹理
                const tex = this.textures.exists('Crystal') ? 'Crystal' : 'drop_crystal_img';
                const c = this.add.image(mx, my, tex);
                if (tex === 'Crystal') c.setDisplaySize(20, 20);  // 缩到适当大小
                c.setDepth(700);  // > player (600), < fog (810)
                if (this.uiCam) this.uiCam.ignore(c);

                // 标记为可拾取
                c._isDroppedCrystal = true;
                c._pickupReadyAt = this.time.now + 1000;  // 1 秒后才可拾取
                c.active = true;

                this.droppedCrystals.add(c);

                // 跳跃 tween：上抛 + 落到目标点
                const peakY = Math.min(my, targetY) - 30 - Math.random() * 20;
                const dur = 350;
                this.tweens.add({
                    targets: c,
                    x: targetX,
                    duration: dur,
                    ease: 'Linear'
                });
                // 旋转 tween（跳跃期间 360°）
                this.tweens.add({
                    targets: c,
                    angle: 360,
                    duration: dur,
                    ease: 'Linear'
                });
                this.tweens.add({
                    targets: c,
                    y: peakY,
                    duration: dur / 2,
                    ease: 'Quad.easeOut',
                    yoyo: false,
                    onComplete: () => {
                        this.tweens.add({
                            targets: c,
                            y: targetY,
                            duration: dur / 2,
                            ease: 'Quad.easeIn',
                            onComplete: () => {
                                c.angle = 0;  // 落地后正立
                            }
                        });
                    }
                });
            }
        });

        this.events.on('slime_split', (x, y) => {
            for (let i = 0; i < 2; i++) {
                let m = new CrystalSlime(this, x + (i===0?-20:20), y-10, true);
                this.miniSlimes.add(m);
                this.physics.add.collider(m, this.walls);
            }
        });
        // (用户修复) crystal_explode 监听拆除 — VolatileCrystal 现在直接调用 handleCrystalExplosion, 留监听会双重伤害

        // 地面碰撞
        this.physics.add.collider([this.spiders, this.earthworms, this.slimes, this.miniSlimes, this.beetles, this.volatileCrystals, this.mimicOres, this.cowardMimics], this.walls);
        // 【关键修复】垂丝蛛也要和墙壁碰撞（之前漏了，导致落地时穿墙掉出世界外）
        this.physics.add.collider(this.bungeeSpiders, this.walls);

        // 铁镐命中怪物（伤害 2，打中即收回）
        const pickHit = (pick, monster, immuneToPickaxe=false) => {
            if (!monster || !monster.scene) return;
            if (pick.state !== 'flying_max') return;
            if (!immuneToPickaxe) monster.takeDamage(2 / (window.AbyssDiff ? AbyssDiff.get().hpMul : 1), this.player.x, this.player.y);
            this.recallSystem.startRecall(pick, true);
        };
        this.physics.add.overlap([this.pick1,this.pick2], this.spiders,       (pk,m) => pickHit(pk,m));
        this.physics.add.overlap([this.pick1,this.pick2], this.bungeeSpiders, (pk,m) => pickHit(pk,m));
        this.physics.add.overlap([this.pick1,this.pick2], this.bats,          (pk,m) => pickHit(pk,m));
        this.physics.add.overlap([this.pick1,this.pick2], this.earthworms,    (pk,m) => pickHit(pk,m));
        this.physics.add.overlap([this.pick1,this.pick2], this.slimes,        (pk,m) => pickHit(pk,m));
        this.physics.add.overlap([this.pick1,this.pick2], this.miniSlimes,    (pk,m) => pickHit(pk,m));
        this.physics.add.overlap([this.pick1,this.pick2], this.beetles,       (pk,m) => pickHit(pk,m,true));
        this.physics.add.overlap([this.pick1,this.pick2], this.volatileCrystals, (pk,m) => {
            if (pk.state==='flying_max' && m.state==='idle') { m.takeDamage(); pickHit(pk,m,true); }
        });
        this.physics.add.overlap([this.pick1,this.pick2], this.mimicOres, (pk,m) => {
            if (pk.state==='flying_max' && m.state==='disguised') { m.onHit(); this.recallSystem.startRecall(pk,true); }
        });
        this.physics.add.overlap([this.pick1,this.pick2], this.cowardMimics, (pk,m) => {
            if (pk.state==='flying_max' && m.state==='disguised') { m.onHit(); this.recallSystem.startRecall(pk,true); }
        });

        // 玩家被怪物伤害：只有怪物处于"攻击状态"才扣血（canDamagePlayer 返回 true）
        const dmgCheck = (p, m) => {
            if (m.canDamagePlayer && m.canDamagePlayer()) {
                this._playerHit(p, m);
                if (m.onHitPlayer) m.onHitPlayer(); // Slime 命中后 5 秒冻结
            }
        };
        [this.spiders,this.bungeeSpiders,this.bats,this.slimes,this.miniSlimes,this.beetles].forEach(grp =>
            this.physics.add.overlap(this.player, grp, dmgCheck));
        this.physics.add.overlap(this.player, this.earthworms, dmgCheck);
        this.physics.add.overlap(this.player, this.mimicOres,  dmgCheck);
        this.physics.add.overlap(this.player, this.cowardMimics, dmgCheck);

        // 视觉
        this.ropeGraphics    = this.add.graphics().setDepth(2);
        this.monsterGraphics = this.add.graphics().setDepth(1);

        // === 调试格子线条（32×32 网格）按 R 切换 ===
        this._gridGraphics = this.add.graphics().setDepth(0);
        this._gridGraphics.lineStyle(1, 0xffffff, 0.15);
        const G_W = 3200, G_H = 1800, GS = 32;
        for (let x = 0; x <= G_W; x += GS) {
            this._gridGraphics.moveTo(x, 0);
            this._gridGraphics.lineTo(x, G_H);
        }
        for (let y = 0; y <= G_H; y += GS) {
            this._gridGraphics.moveTo(0, y);
            this._gridGraphics.lineTo(G_W, y);
        }
        this._gridGraphics.strokePath();
        this._gridGraphics.setVisible(false);  // 默认关闭，按 R 打开
        const cursorTex = this.textures.exists('Mouse_cursor') ? 'Mouse_cursor' : 'crosshair_custom';
        this.crosshair          = this.add.sprite(0, 0, cursorTex).setDepth(999999).setScrollFactor(0);   // (用户) 鼠标永远最高显示优先级 — 9999 会被成就面板(25000+)压住
        { const _p0 = this.input && this.input.activePointer; if (_p0) this.crosshair.setPosition(_p0.x, _p0.y); }   // (用户修复) 创建即归位 — 防地图刚显示时光标在 (0,0) 闪没一瞬
        try { this.game.canvas.style.cursor = 'none'; } catch (e) {}   // (用户) 精灵就位, 此刻才隐藏 OS 光标
        if (cursorTex !== 'Mouse_cursor') this.crosshair.setTint(0xffff00);
        this.leftHandIndicator  = this.add.sprite(0,0,'left_hand_icon').setDepth(999998).setVisible(false).setScrollFactor(0);
        this.rightHandIndicator = this.add.sprite(0,0,'right_hand_icon').setDepth(999998).setVisible(false).setScrollFactor(0);

        // 鼠标位置用屏幕坐标（不受相机缩放/滚动影响）
        this.input.on('pointermove', (pointer) => {
            if (!this.crosshair) return;
            const sx = pointer.x, sy = pointer.y;
            this.crosshair.setPosition(sx, sy);
            this.leftHandIndicator.setPosition(sx - 22, sy);
            this.rightHandIndicator.setPosition(sx + 22, sy);
        });

        // 鼠标输入
        this.input.on('pointerdown', (pointer) => {
            if (!this.player.body || this.isPlayerStunned || this.isDead) return;
            // 剧情动画期间禁止任何操作（包括开场落地动画）
            if (this._cinematicLock) return;
            if (this.shopSystem.isOpen || this.hudSystem.gamePausedByConfirm) return;
            // 任何 UI 面板打开时玩家都不行动
            if (this.backpackSystem?.isOpen || this.settingsSystem?.isOpen || this.creativeSystem?.isOpen) return;
            if (this.dialogSystem?.isOpen) return;
            if (this.guideSystem?.isOpen) return;
            // 关闭面板的同一次点击不应该触发攻击
            if (this._suppressNextClick) {
                this._suppressNextClick = false;
                return;
            }
            // 检查点击是否落在 HUD 按钮区（设定/背包/创造/感叹号）
            if (this._isClickOnHUDButton(pointer)) return;

            let item = this.inventorySystem.getActiveItem();
            let holdingPickaxe = item && item.type === 'pickaxe';

            let side = this.player.pState.activeHand;
            let pick = side === 'left' ? this.pick1 : this.pick2;

            if (pointer.button === 2) {
                // 右键：铁镐丢 / 收（药水使用已迁移到 Z / X / C 快捷键）
                // 需 pickaxeUpgraded (Amber 任务完成后)
                if (holdingPickaxe && this._pickaxeUpgraded) {
                    pick.state === 'idle' ? this.throwSystem.releaseThrow(pointer) : this.recallSystem.startRecall(pick);
                }
            } else if (pointer.button === 0) {
                // 左键：挂着的铁镐用来飞 (需升级), 其他情况都是近战
                if (holdingPickaxe && pick.state === 'attached' && this._pickaxeUpgraded) {
                    this.grappleSystem.startZip(pick);
                } else {
                    this.meleeSystem.execute();
                }
            }
        });

        // UI Camera 设置（主相机 ignore UI / UI 相机 ignore 世界对象 / debug 图形 ignore）
        this.uiCam = this.cameraSystem.setupUICamera(this);
    }

    _isInView(x, y, margin = 250) {
        let v = this.cameras.main.worldView;
        return x > v.x - margin && x < v.right + margin && y > v.y - margin && y < v.bottom + margin;
    }

    /**
     * 注册所有怪物 anim (Bat / Beetle / VolatileCrystal / EarthWorm)。
     * 幂等：用 anims.exists 守卫，多次调用安全。
     * 每个 SafeZone scene 必须在 create() 调一次，因为它们不调 super.create()。
     */
    _registerMonsterAnims() {
        // 数据驱动: [key, sheet, lastFrameIdx, frameRate, repeat]
        // repeat: -1 = loop, 0 = once (停在最后一帧)
        const monsterAnims = [
            // Bat — bat_idle 特殊：play once + 保持最后一帧 (倒挂在洞穴顶)
            ['bat_idle',     'Bat_idle',     3, 8,  0],   // 4 frames
            ['bat_fly',      'Bat_fly',      3, 12, -1],  // 4 frames, loop
            ['bat_attack',   'Bat_attack',   2, 14, 0],   // 3 frames, once
            ['bat_injuried', 'Bat_injuried', 1, 14, 0],   // 2 frames, once
            ['bat_dead',     'Bat_dead',     2, 8,  0],   // 3 frames, once
            // Beetle
            ['beetle_idle',     'Beetle_idle',     3, 8,  -1],
            ['beetle_run',      'Beetle_run',      5, 12, -1],
            ['beetle_attack',   'Beetle_attack',   5, 14, 0],
            ['beetle_injuried', 'Beetle_injuried', 2, 14, 0],
            ['beetle_dead',     'Beetle_dead',     3, 8,  0],
            // VolatileCrystal
            ['volatile_crystal_idle',     'VolatileCrystal_idle',     3, 8,  -1],
            ['volatile_crystal_charge',   'VolatileCrystal_charge',   4, 10, 0],
            ['volatile_crystal_explode',  'VolatileCrystal_explode',  4, 14, 0],
            ['volatile_crystal_injuried', 'VolatileCrystal_injuried', 1, 14, 0],
            ['volatile_crystal_dead',     'VolatileCrystal_dead',     3, 8,  0],
            // EarthWorm
            ['earthworm_idle',     'EarthWorm_idle',     3, 8,  -1],
            ['earthworm_move',     'EarthWorm_move',     5, 12, -1],
            ['earthworm_pop_up',   'EarthWorm_pop_up',   3, 14, 0],
            ['earthworm_attack',   'EarthWorm_attack',   2, 14, 0],
            ['earthworm_injuried', 'EarthWorm_injuried', 1, 14, 0],
            ['earthworm_dead',     'EarthWorm_dead',     2, 8,  0],
        ];
        for (const [key, sheet, lastFrame, rate, rep] of monsterAnims) {
            if (this.textures.exists(sheet) && !this.anims.exists(key)) {
                this.anims.create({
                    key,
                    frames: this.anims.generateFrameNumbers(sheet, { start: 0, end: lastFrame }),
                    frameRate: rate,
                    repeat: rep
                });
            }
        }
    }

    /** Golem boss 专用动画 — 可被任意 SZ 场景 call 注册 (全局 anim, 注册一次即可) */
    _registerGolemAnims() {
        if (this.anims.exists('g_wake_part1')) return;  // 防重复
        // g_wake_part1: 0-24, 起身停顿在 frame 24
        // g_wake_part2: 24-30, 起飞瞬间从 frame 24 继续播
        if (this.textures.exists('G_wake')) {
            this.anims.create({ key: 'g_wake_part1', frames: this.anims.generateFrameNumbers('G_wake', { start: 0, end: 24 }), frameRate: 14, repeat: 0 });
            this.anims.create({ key: 'g_wake_part2', frames: this.anims.generateFrameNumbers('G_wake', { start: 24, end: 30 }), frameRate: 14, repeat: 0 });
        }
        if (this.textures.exists('GHand_palmR_swipe')) {
            this.anims.create({ key: 'g_hand_palm_swipe', frames: this.anims.generateFrameNumbers('GHand_palmR_swipe', { start: 0, end: 4 }), frameRate: 16, repeat: 0 });
        }
        if (this.textures.exists('GHand_rockR_smash')) {
            this.anims.create({ key: 'g_hand_rock_smash', frames: this.anims.generateFrameNumbers('GHand_rockR_smash', { start: 0, end: 4 }), frameRate: 16, repeat: 0 });
        }
        // 嘴 open: frames 0-7 (8 帧), 14fps = 571ms (跟 descending ~666ms 接近, 落地前播完)
        if (this.textures.exists('GMouth')) {
            this.anims.create({ key: 'g_mouth_open', frames: this.anims.generateFrameNumbers('GMouth', { start: 0, end: 7 }), frameRate: 14, repeat: 0 });
        }
    }

    /** 检查点击是否在 HUD 按钮区（设定/背包/创造/感叹号 + 它们触发的关闭按钮）*/
    _isClickOnHUDButton(pointer) {
        // 屏幕坐标（pointer.x, pointer.y 是屏幕坐标）
        const sx = pointer.x;
        const sy = pointer.y;
        const W = this.cameras.main.width;
        const H = this.cameras.main.height;

        // 设定按钮（W-40, 40） 54x54
        if (Math.abs(sx - (W - 40)) < 32 && Math.abs(sy - 40) < 32) return true;
        // 背包按钮（W-100, 40）
        if (Math.abs(sx - (W - 100)) < 32 && Math.abs(sy - 40) < 32) return true;
        // 创造按钮（40, H-40）
        if (Math.abs(sx - 40) < 32 && Math.abs(sy - (H - 40)) < 32) return true;
        // 感叹号 guide 按钮（60, 180） 54x54
        if (Math.abs(sx - 60) < 32 && Math.abs(sy - 180) < 32) return true;

        return false;
    }

    _playerHit(player, monster) {
        if (monster && monster.hp !== undefined && monster.hp <= 0) return;
        if (this.isDashing || this.isPlayerStunned || this.isPlayerInvincible || this.isDead) return;

        // 怪物类型 → 伤害量 + 副作用 spec
        const spec = this._getMobDamageSpec(monster);
        const _dmul = (window.AbyssDiff ? AbyssDiff.get().dmgMul : 1);   // (用户) 难度: 怪物伤害倍率
        const wasEffective = this.healthSystem.takeDamage(spec.hp * _dmul);

        // 副作用只在"有效命中"时附加 (玩家不在无敌帧才算)
        if (wasEffective && this.diseaseSystem) {
            if (spec.corrosionInstant) this.diseaseSystem.addCorrosion(spec.corrosionInstant);
            if (spec.corrosionDoT)     this.diseaseSystem.addCorrosionDoT(spec.corrosionDoT[0], spec.corrosionDoT[1]);
            if (spec.hpDoT)            this.diseaseSystem.addHpDoT(spec.hpDoT[0] * _dmul, spec.hpDoT[1]);
            if (spec.tempSlow)         this.diseaseSystem.addTempSlow(spec.tempSlow[0], spec.tempSlow[1]);
        }

        if (!wasEffective) return;  // 无效命中 (无敌挡掉) → 不击退不眩晕
        if (this.healthSystem.isDead) return;

        // 【防穿墙】挂钩状态被打 → 恢复物理碰撞 + 收回镐
        let wasGhost = this.isGrappling || this.isHanging;
        if (wasGhost) {
            player.body.checkCollision.none = false;
            if (this.activeGrapplePick) {
                this.recallSystem.startRecall(this.activeGrapplePick);
                this.activeGrapplePick = null;
            }
            if (this.grappleSystem) this.grappleSystem.hasSnapped = false;
        }

        this.isPlayerStunned = true;
        // 注: isPlayerInvincible 由 HealthSystem 自己管 (0.5s), 这里不再设置
        this.isGrappling = false;
        this.isHanging = false;
        this.isMeleeAttacking = false;
        player.body.setAllowGravity(true);

        player.setTint(0xff0000);
        let pushDir = monster ? (player.x > monster.x ? 1 : -1) : 1;
        player.body.setVelocity(pushDir * 120, -100);

        this.time.delayedCall(240, () => {
            if (!this.isDead) { this.isPlayerStunned = false; player.clearTint(); }
        });
    }

    /**
     * 根据 monster 实例类型返回伤害规格.
     * monster=null → 爆炸花爆炸 (VolatileCrystal explode)
     * 数组: [perSec, durationSec]
     */
    _getMobDamageSpec(monster) {
        if (!monster) {
            // 爆炸花爆炸: 30 HP + 3% 侵蚀度 + 1%/秒 × 2s
            return { hp: 30, corrosionInstant: 3, corrosionDoT: [1, 2] };
        }
        const type = monster.constructor && monster.constructor.name;
        switch (type) {
            case 'CrystalSlime':
                return monster.isMini
                    ? { hp: 4,  corrosionDoT: [0.5, 2] }   // 小史莱姆: 4 HP + 0.5%/s × 2s
                    : { hp: 12, corrosionDoT: [1, 3] };    // 大史莱姆: 12 HP + 1%/s × 3s
            case 'CrystalBat':           return { hp: 15 };
            case 'CrystalHunterSpider':  return { hp: 12, hpDoT: [2, 3] };  // 12 HP + 2 HP/s × 3s (DoT 不触发 iframe)
            case 'CrystalBungeeSpider':  return { hp: 12, hpDoT: [2, 3] };
            case 'CrystalEarthworm':     return { hp: 12, tempSlow: [15, 1.5] };  // 12 HP + 15% 减速 × 1.5s
            case 'HardrockBeetle':       return { hp: 15 };
            // MimicOre, CowardMimicOre 等没在 spec 里 → 默认 10
            default:                     return { hp: 10 };
        }
    }

    handleCrystalExplosion(cx, cy, radius) {
        let fx = this.add.graphics();
        if (this.uiCam) this.uiCam.ignore(fx);
        fx.lineStyle(4, 0xffffff, 1); fx.strokeCircle(cx, cy, radius);
        fx.fillStyle(0xffffff, 0.3); fx.fillCircle(cx, cy, radius);
        this.tweens.add({ targets: fx, alpha: 0, duration: 500, onComplete: () => fx.destroy() });

        if (Phaser.Math.Distance.Between(cx, cy, this.player.x, this.player.y) <= radius) {
            this._playerHit(this.player, null);
            if (!this.isDead) {
                let a = Phaser.Math.Angle.Between(cx, cy, this.player.x, this.player.y);
                this.player.body.setVelocity(Math.cos(a)*350, Math.sin(a)*350 - 100);
            }
        }
        [this.spiders,this.bungeeSpiders,this.bats,this.earthworms,this.slimes,this.miniSlimes,this.beetles].forEach(grp =>
            grp.getChildren().forEach(m => {
                if (m.hp > 0 && Phaser.Math.Distance.Between(cx, cy, m.x, m.y) <= radius) m.takeDamage(5);
            }));
        this.volatileCrystals.getChildren().forEach(c => {
            if (c.state === 'idle' && Phaser.Math.Distance.Between(cx, cy, c.x, c.y) <= radius * 1.2)
                this.time.delayedCall(120, () => { if (c && c.trigger) c.trigger(); });
        });
    }

    createWall(x, y, w, h) {
        let wall = this.add.rectangle(x, y, w, h, 0x555555);
        this.walls.add(wall);
        this.wallRects.push(new Phaser.Geom.Rectangle(x-w/2, y-h/2, w, h));
        if (this.gridSystem) this.gridSystem.markRect(x, y, w, h, GridSystem.WALL);
    }

    // ── (用户) UI 暂停: 设置/guide 打开时, 物理/计时器/补间/动画全停 (剧情节拍一并冻结), 关闭后恢复 ──
    _setUIPause(on, opts) {
        on = !!on;
        if (this._uiPaused === on) return;
        this._uiPaused = on;
        const lite = !!(opts && opts.lite);
        try {
            if (on) {
                this._uiPauseLite = lite;
                if (this.physics && this.physics.world) this.physics.world.pause();
                // lite 模式 (guide 用): 时钟/补间/动画保持运转 — guide 演示靠它们动;
                // 物理 + 场景 update 闸门照停, 世界仍然冻结. settings 用完整冻结 (剧情计时也停).
                if (!lite) {
                    if (this.time) this.time.paused = true;
                    if (this.tweens) this.tweens.pauseAll();
                    if (this.anims && this.anims.pauseAll) this.anims.pauseAll();
                }
                if (this._stepSnd) { try { this._stepSnd.stop(); this._stepSnd.destroy(); } catch (e) {} this._stepSnd = null; this._stepKey = null; }
            } else {
                if (this.physics && this.physics.world) this.physics.world.resume();
                if (!this._uiPauseLite) {
                    if (this.time) this.time.paused = false;
                    if (this.tweens) this.tweens.resumeAll();
                    if (this.anims && this.anims.resumeAll) this.anims.resumeAll();
                }
                this._uiPauseLite = false;
            }
        } catch (e) {}
    }

    // ── (用户) 空气墙对稿子按真墙处理: 进 CCD 扫掠列表 + arcade 碰撞器 (慢速命中也走 handlePickCollide 钉墙) ──
    _registerPickBlocker(w) {
        if (!w) return;
        (this._pickExtraWalls = this._pickExtraWalls || []).push(w);
        this._addPickWallCollider(w);
    }
    _addPickWallCollider(w) {
        if (!w || !w.body) return;
        if (this.pick1) this.physics.add.collider(this.pick1, w, () => this.handlePickCollide(this.pick1, 1));
        if (this.pick2) this.physics.add.collider(this.pick2, w, () => this.handlePickCollide(this.pick2, 2));
    }

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

    /**
     * 装真稿子系统 — 供安全区调用 (安全区默认 pick1/pick2 是 stub, 没 this.inv)
     * 需在 this.player / this.walls / this.recallSystem 已创建后调用
     */
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
        // 绳索 graphics (depth 650: 玩家 600 之上, 掉落物 700 之下)
        if (!this.ropeGraphics) {
            this.ropeGraphics = this.add.graphics().setDepth(650);
            if (this.uiCam) { try { this.uiCam.ignore(this.ropeGraphics); } catch(e) {} }
        }
    }

    /**
     * 注册"飞行稿子命中怪物"的 overlap — SZ 场景不调 super.create(), 需各自调一次.
     * 飞行中 (state 'flying_max') 的稿子撞到怪物 → 扣血 2 + 收回.
     */
    // 通用玩家状态初始化 (SZ 场景各自有覆盖版; HubScene 等没覆盖的继承这个基类版)
    _initT1State() {
        this.lastDashTime = 0; this.dashCooldown = 0;
        this.isDashing = false; this.dashDuration = 120; this.dashSpeed = 1600;
        this.isHanging = false; this.isGrappling = false; this.isCrouching = false;
        this.isPlayerStunned = false; this.isMeleeAttacking = false;
        this.meleeCooldown = 0; this.meleeAttackFlipX = false;
        this.isDead = false;
        this.ropeLength1 = 0; this.ropeLength2 = 0;
    }

    // ===== 共享死亡动画: 黑底 + 中央爱心 + 最右碎裂 (SZ25 同款, 推广到所有场景) =====
    // n = 死前爱心数; onComplete 在碎裂完成后调用 (复活 / 回大厅)
    _deathHeartAnim(n, onComplete) {
        const cam = this.cameras.main;
        const cw = cam.width, ch = cam.height;
        const black = this.add.rectangle(cw / 2, ch / 2, cw, ch, 0x000000, 0).setScrollFactor(0).setDepth(99999);
        if (this.uiCam) { try { cam.ignore(black); } catch (e) {} }   // 有 uiCam: 只走 uiCam(顶层) 盖住含黑雾的一切; 无 uiCam: 留主相机, depth 99999 仍在黑雾(810)等之上
        this._deathBlackOverlay = black;
        this.tweens.add({
            targets: black, alpha: 1, duration: 500, ease: 'Quad.easeIn',
            onComplete: () => this._deathShowHearts(n, onComplete)
        });
    }

    _deathShowHearts(n, onComplete) {
        if (typeof AudioSystem !== 'undefined') AudioSystem.sfx(this, 'LoseALife');   // (用户) 爱心列队出现瞬间
        const cam = this.cameras.main;
        const cw = cam.width, ch = cam.height;
        const spacing = 128;   // (用户) 爱心放大 2 倍, 间距同步翻倍
        const cnt = Math.max(1, n | 0);
        const startX = cw / 2 - (cnt - 1) * spacing / 2;
        const arr = [];
        for (let i = 0; i < cnt; i++) {
            const h = this.textures.exists('Heart')
                ? this.add.image(startX + i * spacing, ch / 2, 'Heart').setDisplaySize(104, 104)   // (用户) Heart 贴图 (32 原生 → 104 显示, 与旧字号一致)
                : this.add.text(startX + i * spacing, ch / 2, '\u2764', {
                    fontSize: '104px', color: '#ff3355', fontFamily: '"VT323", monospace'   // (用户) 大小翻 2 倍
                });
            h.setOrigin(0.5).setScrollFactor(0).setDepth(100000);
            if (this.uiCam) { try { cam.ignore(h); } catch (e) {} }   // 爱心 depth 100000 > 黑布 99999, 两种相机配置都在布之上
            arr.push(h);
        }
        this._deathHearts = arr;
        this.time.delayedCall(420, () => {
            this._deathShatterHeart(arr[cnt - 1], () => {
                this.time.delayedCall(280, () => { if (onComplete) onComplete(); });
            });
        });
    }

    _deathShatterHeart(heart, onDone) {
        if (!heart || !heart.active) { if (onDone) onDone(); return; }
        const hx = heart.x, hy = heart.y;
        // (用户) HeartBreak 贴图碎裂动画 — 抖动后整颗换成 11 帧碎裂; 缺图走旧文字碎裂
        // 惰性注册 (SZ 场景不跑 GameScene.create 的动画注册段, 这里自带)
        if (this.textures.exists('HeartBreak') && !this.anims.exists('heart_break')) {
            try {
                const _hb = this.textures.get('HeartBreak');
                this.anims.create({ key: 'heart_break', frames: this.anims.generateFrameNumbers('HeartBreak', { start: 0, end: Math.max(0, _hb.frameTotal - 2) }), frameRate: 18, repeat: 0 });
            } catch (e) {}
        }
        if (this.textures.exists('HeartBreak') && this.anims.exists('heart_break')) {
            this.tweens.add({
                targets: heart, x: hx + 6, duration: 38, yoyo: true, repeat: 5, ease: 'Sine.easeInOut',
                onComplete: () => {
                    try { heart.destroy(); } catch (e) {}
                    const br = this.add.sprite(hx, hy, 'HeartBreak').setOrigin(0.5).setScrollFactor(0).setDepth(100001);
                    br.setDisplaySize(104, 104);
                    if (this.uiCam) { try { this.cameras.main.ignore(br); } catch (e) {} }
                    if (!this._deathFragments) this._deathFragments = [];
                    this._deathFragments.push(br);
                    br.play('heart_break');
                    br.once('animationcomplete-heart_break', () => {
                        this.tweens.add({ targets: br, alpha: 0, duration: 220, delay: 140 });
                    });
                    this.time.delayedCall(820, () => { if (onDone) onDone(); });
                }
            });
            return;
        }
        if (heart.setColor) heart.setColor('#999999');
        this.tweens.add({
            targets: heart, x: hx + 6, duration: 38, yoyo: true, repeat: 5, ease: 'Sine.easeInOut',
            onComplete: () => {
                if (heart.setColor) heart.setColor('#ff3355');
                this.tweens.add({ targets: heart, scaleX: 0.1, scaleY: 0.1, angle: 130, alpha: 0, duration: 260, ease: 'Quad.easeIn' });
                for (let i = 0; i < 6; i++) {
                    const f = this.add.text(hx, hy, '\u2764', {
                        fontSize: '40px', color: '#ff3355', fontFamily: '"VT323", monospace'
                    }).setOrigin(0.5).setScrollFactor(0).setDepth(100001);
                    if (this.uiCam) { try { this.cameras.main.ignore(f); } catch (e) {} }
                    if (!this._deathFragments) this._deathFragments = [];
                    this._deathFragments.push(f);
                    const ang = (Math.PI * 2 / 6) * i + Math.random() * 0.6;
                    const dist = 80 + Math.random() * 60;
                    this.tweens.add({
                        targets: f,
                        x: hx + Math.cos(ang) * dist, y: hy + Math.sin(ang) * dist + 60,
                        angle: Math.random() * 360, alpha: 0, scaleX: 0.3, scaleY: 0.3,
                        duration: 460, ease: 'Quad.easeOut',
                        onComplete: () => { if (f && f.destroy) f.destroy(); }
                    });
                }
                this.time.delayedCall(480, () => { if (onDone) onDone(); });
            }
        });
    }

    // 复活后淡出黑底 (回大厅时场景重启会自动清, 不需调)
    _deathClearOverlay() {
        if (this._deathHearts) { this._deathHearts.forEach(h => { try { h.destroy(); } catch (e) {} }); this._deathHearts = null; }
        if (this._deathFragments) { this._deathFragments.forEach(f => { try { f.destroy(); } catch (e) {} }); this._deathFragments = null; }
        if (this._deathBlackOverlay) {
            const b = this._deathBlackOverlay; this._deathBlackOverlay = null;
            this.tweens.add({ targets: b, alpha: 0, duration: 400, onComplete: () => { try { b.destroy(); } catch (e) {} } });
        }
    }

    _registerPickMonsterHits() {
        if (this._pickHitsRegistered) return;
        if (!this.pick1 || !this.pick2) return;
        this._pickHitsRegistered = true;
        const pickHit = (pick, monster, immune = false) => {
            if (!monster || !monster.scene) return;
            if (pick.state !== 'flying_max') return;
            if (!immune && typeof monster.takeDamage === 'function') monster.takeDamage(2, this.player.x, this.player.y);
            this.recallSystem.startRecall(pick, true);
            this._pickThrowCooldownUntil = this.time.now + 200;   // 命中 mob 收回后 0.2s 冷却
        };
        [this.spiders, this.bungeeSpiders, this.bats, this.earthworms, this.slimes, this.miniSlimes].forEach(grp => {
            if (grp) this.physics.add.overlap([this.pick1, this.pick2], grp, (pk, m) => pickHit(pk, m));
        });
        if (this.beetles) this.physics.add.overlap([this.pick1, this.pick2], this.beetles, (pk, m) => pickHit(pk, m, true));
        if (this.volatileCrystals) this.physics.add.overlap([this.pick1, this.pick2], this.volatileCrystals, (pk, m) => {
            if (pk.state === 'flying_max' && m.state === 'idle') { m.takeDamage(); pickHit(pk, m, true); }
        });
        [this.mimicOres, this.cowardMimics].forEach(grp => {
            if (grp) this.physics.add.overlap([this.pick1, this.pick2], grp, (pk, m) => {
                if (pk.state === 'flying_max' && m.state === 'disguised') { m.onHit(); this.recallSystem.startRecall(pk, true); this._pickThrowCooldownUntil = this.time.now + 200; }
            });
        });
    }

    /**
     * 真稿子物理更新 — 供安全区 update 调用 (跟 MainGameScene.update 内联的同一套逻辑)
     */
    // CCD 扫掠: 稿子这帧 body 从上一帧位置移到当前, 若穿过任何墙(this.walls 真实墙体 + _pickExtraWalls 空气墙) 就回溯到墙面外, 返回 true
    _sweepPickToWall(p) {
        if (!p.body) return false;
        const hw = p.body.halfWidth, hh = p.body.halfHeight;
        const x0 = p.body.prev.x + hw, y0 = p.body.prev.y + hh;   // 上一帧中心
        const x1 = p.body.center.x, y1 = p.body.center.y;          // 当前中心
        const dx = x1 - x0, dy = y1 - y0;
        const dist = Math.hypot(dx, dy);
        if (dist < 4 || dist > 150) return false;   // 没怎么动 / 异常(出生/传送/回收) → 不处理
        const ux = dx / dist, uy = dy / dist;
        const walls = (this.walls && this.walls.getChildren) ? this.walls.getChildren() : [];
        const extra = this._pickExtraWalls || [];
        const inWall = (x, y) => {
            for (let i = 0; i < walls.length; i++) {
                const w = walls[i];
                if (w && w.body && x >= w.body.left && x <= w.body.right && y >= w.body.top && y <= w.body.bottom) return true;
            }
            for (let i = 0; i < extra.length; i++) {
                const w = extra[i];
                if (w && w.body && x >= w.body.left && x <= w.body.right && y >= w.body.top && y <= w.body.bottom) return true;
            }
            return false;
        };
        for (let t = 4; t <= dist; t += 4) {
            if (inWall(x0 + ux * t, y0 + uy * t)) {
                // 回溯到刚好贴在墙面外 (墙外最后一点)
                let bx = x0, by = y0;
                for (let b = t - 2; b >= 0; b -= 2) {
                    const tx = x0 + ux * b, ty = y0 + uy * b;
                    if (!inWall(tx, ty)) { bx = tx; by = ty; break; }
                }
                p.body.reset(bx, by);   // 钉到墙面 (停速度 + 同步 sprite 位置)
                return true;
            }
        }
        return false;
    }

    _updateRealPickaxes(time, delta) {
        if (!this.pick1 || !this.pick1.body) return;  // stub 或未装则跳过
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

    update(time, delta) {
        if (this._uiPaused) return;   // (用户) 设置/guide 打开 → 全场景暂停
        if (!this.player.body) return;

        // 总开关：商店/确认框/死亡时暂停大部分逻辑
        let paused = this.shopSystem.isOpen || this.hudSystem.gamePausedByConfirm;

        if (this.dashCooldown > 0)  this.dashCooldown  -= delta;
        if (this.meleeCooldown > 0) this.meleeCooldown -= delta;

        // crosshair 位置由 'pointermove' 事件实时更新（见 create），这里不再每帧重定位
        // 但镜头滚动时仍需要同步一次（鼠标不动相机移动的情况）
        let pointer = this.input.activePointer;
        const sx = pointer.x, sy = pointer.y;
        this.crosshair.setPosition(sx, sy);
        this.leftHandIndicator.setPosition(sx - 22, sy);
        this.rightHandIndicator.setPosition(sx + 22, sy);

        // 【强制保险】：商店/确认框打开时，每帧都把 crosshair + 左右手指示设为 hidden
        if (paused) {
            this.crosshair.setVisible(false);
            this.leftHandIndicator.setVisible(false);
            this.rightHandIndicator.setVisible(false);
        }

        // 死亡倒数
        this.healthSystem.update(delta);

        // 商人交互（必须在 paused 检查之前，因为商店打开时按 E 也要能关闭）
        this.interactSystem.update();

        // (用户) 光影黑雾更新 (T2/T3 经 super.update 也走这里; 之前基类完全没有这行 → T2/T3/主矿洞永远不画)
        if (this.fogSystem && this.player) this.fogSystem.update(this.player.x, this.player.y);

        // R 键切换网格显示
        if (this.keyR && Phaser.Input.Keyboard.JustDown(this.keyR)) {
            if (this._gridGraphics) {
                this._gridGraphics.setVisible(!this._gridGraphics.visible);
            }
        }
        // 鼠标中键：切换坐标显示（开启时坐标跟随鼠标，再按一次关闭）
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
            this._gridCoordText.destroy();
            this._gridCoordText = null;
            this._gridCoordVisible = false;
        }

        // 暂停/死亡时不跑移动和怪物 AI
        if (paused || this.isDead) return;

        // 玩家移动
        if (!this.isPlayerStunned) {
            this.movementSystem.update(time, delta);
        }

        // Z / X / C 快捷槽使用
        if (this.backpackSystem) {
            if (Phaser.Input.Keyboard.JustDown(this.keyZ)) this.backpackSystem.useQuickSlot(0);
            if (Phaser.Input.Keyboard.JustDown(this.keyX)) this.backpackSystem.useQuickSlot(1);
            if (Phaser.Input.Keyboard.JustDown(this.keyC)) this.backpackSystem.useQuickSlot(2);
            // B 键开关背包
            if (Phaser.Input.Keyboard.JustDown(this.keyB)) {
                if (!this.settingsSystem?.isOpen) this.backpackSystem.toggle();
            }
        }
        // ESC 键开关设定
        if (this.keyESC && Phaser.Input.Keyboard.JustDown(this.keyESC)) {
            if (!this.backpackSystem?.isOpen) this.settingsSystem?.toggle();
        }

        // 物品 CD 更新
        this.inventorySystem.update(delta);
        if (this.dialogSystem) this.dialogSystem.update();
        if (this.hudSystem && this.hudSystem.updateGuideButton) this.hudSystem.updateGuideButton();
        // 商人头顶提示
        if (this.moleTrader && this.moleTrader.active) this.moleTrader.update(this.player);

        // 水晶磁吸拾取（0.5s 内不能拾取）— 触发飞向玩家
        this.droppedCrystals.getChildren().forEach(c => {
            if (!c.active) return;
            if (c._pickupReadyAt && this.time.now < c._pickupReadyAt) return;
            if (c._flying) return;
            let dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, c.x, c.y);
            if (dist <= 160) {
                c._flying = true;
                if (c.body) c.body.enable = false;
                this.tweens.add({
                    targets: c,
                    x: () => this.player.x,
                    y: () => this.player.y,
                    duration: 250,
                    ease: 'Cubic.easeIn',
                    onUpdate: () => {
                        if (c.scale > 0.5) c.scale -= 0.02;
                    },
                    onComplete: () => {
                        c.destroy();
                        this.hudSystem.addCrystal(1);
                    }
                });
            }
        });

        // 怪物 AI
        this.monsterGraphics.clear();
        this.spiders.getChildren().forEach(m => { if (this._isInView(m.x,m.y)) m.update(time,delta,this.player); });
        this.bungeeSpiders.getChildren().forEach(m => { if (this._isInView(m.x,m.y)) { m.update(time,delta,this.player); m.drawSilk(this.monsterGraphics); } });
        this.bats.getChildren().forEach(m => { if (this._isInView(m.x,m.y)) m.update(time,delta,this.player); });
        this.earthworms.getChildren().forEach(m => { if (this._isInView(m.x,m.y)) m.update(time,delta,this.player); });
        this.slimes.getChildren().forEach(m => { if (this._isInView(m.x,m.y)) m.update(time,delta,this.player); });
        this.miniSlimes.getChildren().forEach(m => { if (this._isInView(m.x,m.y)) m.update(time,delta,this.player); });
        this.beetles.getChildren().forEach(m => { if (this._isInView(m.x,m.y)) m.update(time,delta,this.player); });
        this.volatileCrystals.getChildren().forEach(m => {
            if (this._isInView(m.x,m.y)) { m.update(time,delta); m.checkProximity(this.player); }
        });
        this.mimicOres.getChildren().forEach(m => {
            if (this._isInView(m.x,m.y)) m.update(time,delta,this.player);
            // attacking 状态 30px 范围内伤害玩家
            if (m.isPlayerInAttackRange && m.isPlayerInAttackRange(this.player)) {
                this._playerHit(this.player, m);
            }
        });
        this.cowardMimics.getChildren().forEach(m => {
            if (this._isInView(m.x,m.y)) m.update(time,delta,this.player);
        });

        // ===== 绳索绘制（原样保留） =====
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

    /**
     * 共用怪物 update + 双重过滤 (SZ1-5 都用同一套)
     *   1) 距离剔除: 玩家左右 20 格 (640px) 外, 上下 12 格 (384px) 外 → 跳过
     *   2) chunk 剔除: 怪物的 _homeChunk 跟玩家当前 chunk 不一样 → 跳过 (顺便 velocity 归零, 防它漂)
     * 任一条件不满足都跳过 update.
     */
    _updateMonstersFiltered(time, delta) {
        if (!this.player) return;
        const DIST_X = 20 * 32;  // 640 px
        const DIST_Y = 12 * 32;  // 384 px
        const playerChunkId = this._currentChunkId;
        const px = this.player.x, py = this.player.y;
        const groups = ['spiders', 'bats', 'slimes', 'beetles', 'earthworms', 'bungeeSpiders', 'mimicOres', 'volatileCrystals'];
        for (const grpName of groups) {
            const grp = this[grpName];
            if (!grp || !grp.getChildren) continue;
            const children = grp.getChildren();
            for (let i = 0; i < children.length; i++) {
                const m = children[i];
                if (!m || !m.update) continue;
                // 跨 chunk: 冻结速度 + 跳过 update
                if (m._homeChunk && playerChunkId && m._homeChunk.id !== playerChunkId) {
                    if (m.body && m.body.setVelocity) m.body.setVelocity(0, 0);
                    continue;
                }
                // 距离: 玩家矩形 1280×768 外跳过
                if (Math.abs(m.x - px) > DIST_X) continue;
                if (Math.abs(m.y - py) > DIST_Y) continue;
                m.update(time, delta, this.player);
            }
        }
    }
}