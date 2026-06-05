/**
 * SpawnConfig — 独立负责地形生成 + 怪物/NPC 的生成位置与数量
 *
 * 把所有「放东西」的逻辑都收拢到这里，以后只需要在这个文件里改。
 * GameScene 只需调用 SpawnConfig.setup(scene) 完成全部布置。
 */
class SpawnConfig {
    /** 主入口：场景 create() 阶段调用一次 */
    static setup(scene) {
        this.buildTerrain(scene);
        this.spawnNPCs(scene);
        this.spawnMonsters(scene);
    }

    // ------------------------------------------------------------
    // 1. 地形 (沿用原 generateDenseMap 思路)
    // ------------------------------------------------------------
    static buildTerrain(scene) {
        // 世界边界
        scene.createWall(1600, 1752, 3200, 96); // 地板（厚度 96 = 3 格，下方边界翻倍避免物品栏挡视野）
        scene.createWall(1600,   20, 3200, 40); // 天花板
        scene.createWall(  20,  900,   40, 1800); // 左墙
        scene.createWall(3180,  900,   40, 1800); // 右墙

        // 玩家出生平台
        scene.createWall(scene.spawnX, scene.spawnY + 100, 600, 40);

        // 地板生成点
        for (let i = 100; i <= 3100; i += 200) {
            scene.spawnPoints.push({ x: i, y: 1730 });
        }

        // 随机形状平台群
        const shapes = ['platform','pillar','L1','L2','L3','L4','T1','T2','cross','stairs1','stairs2'];
        for (let x = 300; x <= 2900; x += 400) {
            for (let y = 200; y <= 1500; y += 300) {
                if (Phaser.Math.Distance.Between(x, y, scene.spawnX, scene.spawnY) < 600) continue;

                let shape = Phaser.Math.RND.pick(shapes);
                switch (shape) {
                    case 'platform':
                        scene.createWall(x, y, 200, 40);
                        scene.spawnPoints.push({ x, y: y - 40 });
                        break;
                    case 'pillar':
                        scene.createWall(x, y, 40, 200);
                        scene.spawnPoints.push({ x, y: y - 120 });
                        break;
                    case 'L1':
                        scene.createWall(x, y, 40, 160); scene.createWall(x + 60, y + 60, 160, 40);
                        scene.spawnPoints.push({ x: x + 60, y: y + 20 });
                        break;
                    case 'L2':
                        scene.createWall(x, y, 40, 160); scene.createWall(x - 60, y + 60, 160, 40);
                        scene.spawnPoints.push({ x: x - 60, y: y + 20 });
                        break;
                    case 'L3':
                        scene.createWall(x, y, 40, 160); scene.createWall(x + 60, y - 60, 160, 40);
                        scene.spawnPoints.push({ x: x + 60, y: y - 100 });
                        break;
                    case 'L4':
                        scene.createWall(x, y, 40, 160); scene.createWall(x - 60, y - 60, 160, 40);
                        scene.spawnPoints.push({ x: x - 60, y: y - 100 });
                        break;
                    case 'T1':
                        scene.createWall(x, y, 200, 40); scene.createWall(x, y + 60, 40, 160);
                        scene.spawnPoints.push({ x: x - 60, y: y - 40 });
                        scene.spawnPoints.push({ x: x + 60, y: y - 40 });
                        break;
                    case 'T2':
                        scene.createWall(x, y, 200, 40); scene.createWall(x, y - 60, 40, 160);
                        scene.spawnPoints.push({ x, y: y - 160 });
                        break;
                    case 'cross':
                        scene.createWall(x, y, 200, 40); scene.createWall(x, y, 40, 200);
                        scene.spawnPoints.push({ x: x - 60, y: y - 40 });
                        scene.spawnPoints.push({ x: x + 60, y: y - 40 });
                        break;
                    case 'stairs1':
                        scene.createWall(x - 60, y + 60, 60, 60);
                        scene.createWall(x, y, 60, 60);
                        scene.createWall(x + 60, y - 60, 60, 60);
                        scene.spawnPoints.push({ x, y: y - 50 });
                        break;
                    case 'stairs2':
                        scene.createWall(x + 60, y + 60, 60, 60);
                        scene.createWall(x, y, 60, 60);
                        scene.createWall(x - 60, y - 60, 60, 60);
                        scene.spawnPoints.push({ x, y: y - 50 });
                        break;
                }
            }
        }
    }

    // ------------------------------------------------------------
    // 2. NPC 商人（在出生平台旁边，只生成 1 个）
    // ------------------------------------------------------------
    static spawnNPCs(scene) {
        // 商人从空中高处出生，靠重力下落到平台
        // spawnY=250, 平台顶 y=spawnY+80=330。让商人 y=100 出生（远离任何墙）
        let traderX = scene.spawnX + 200;
        let traderY = 100; // 高高的空中
        scene.moleTrader = new MoleTrader(scene, traderX, traderY);
        scene.physics.add.collider(scene.moleTrader, scene.walls);
    }

    // ------------------------------------------------------------
    // 3. 怪物群
    // ------------------------------------------------------------
    static spawnMonsters(scene) {
        // 启动诊断：输出所有怪物类的加载状态
        console.log('[SpawnConfig] 类加载检查:',
            'MimicOre=', typeof MimicOre,
            'CowardMimicOre=', typeof CowardMimicOre,
            'CrystalBat=', typeof CrystalBat
        );

        // 地面怪
        SpawnConfig._spawnGround(scene, scene.spiders,         CrystalHunterSpider, 25);
        SpawnConfig._spawnGround(scene, scene.slimes,          CrystalSlime,        20);
        SpawnConfig._spawnGround(scene, scene.beetles,         HardrockBeetle,      15);
        SpawnConfig._spawnGround(scene, scene.earthworms,      CrystalEarthworm,    15);
        SpawnConfig._spawnGround(scene, scene.volatileCrystals,VolatileCrystal,     20);
        SpawnConfig._spawnGround(scene, scene.mimicOres,       MimicOre,            15);
        SpawnConfig._spawnGround(scene, scene.cowardMimics,    CowardMimicOre,      15);

        // 出生平台附近强制生成 — 让玩家一开始就能看到所有怪物类型
        let nearY = scene.spawnY + 60;
        // 蓝色攻击型拟态矿
        let m1 = new MimicOre(scene, scene.spawnX - 350, nearY);
        scene.mimicOres.add(m1);
        let m2 = new MimicOre(scene, scene.spawnX + 350, nearY);
        scene.mimicOres.add(m2);
        // 紫色胆小拟态矿（如果类存在）
        try {
            let c1 = new CowardMimicOre(scene, scene.spawnX - 200, nearY);
            scene.cowardMimics.add(c1);
            let c2 = new CowardMimicOre(scene, scene.spawnX + 250, nearY);
            scene.cowardMimics.add(c2);
            console.log('[SpawnConfig] 胆小拟态矿强制生成成功，数量:', scene.cowardMimics.getChildren().length);
        } catch (e) {
            console.error('[SpawnConfig] 胆小拟态矿强制生成失败:', e.message);
        }

        // 飞行/悬挂怪
        SpawnConfig._spawnFlying(scene, scene.bungeeSpiders, CrystalBungeeSpider, 15);
        SpawnConfig._spawnFlying(scene, scene.bats,          CrystalBat,          20);
    }

    static _spawnGround(scene, group, MonsterClass, count) {
        let spawned = 0, attempts = 0;
        while (spawned < count && attempts < 1000) {
            attempts++;
            let pt = Phaser.Math.RND.pick(scene.spawnPoints);
            if (Phaser.Math.Distance.Between(pt.x, pt.y, scene.spawnX, scene.spawnY) > 600) {
                let m = new MonsterClass(scene, pt.x, pt.y);
                group.add(m);
                if (MonsterClass === CrystalEarthworm || MonsterClass === VolatileCrystal) {
                    m.y += 15;
                }
                spawned++;
            }
        }
    }

    static _spawnFlying(scene, group, MonsterClass, count) {
        let spawned = 0, attempts = 0;
        while (spawned < count && attempts < 2000) {
            attempts++;
            let rx = Phaser.Math.Between(100, 3100);
            let ry = Phaser.Math.Between(100, 1600);
            if (Phaser.Math.Distance.Between(rx, ry, scene.spawnX, scene.spawnY) > 600) {
                let inWall = false;
                for (let w of scene.wallRects) {
                    if (w.contains(rx, ry)) { inWall = true; break; }
                }
                if (!inWall) {
                    group.add(new MonsterClass(scene, rx, ry));
                    spawned++;
                }
            }
        }
    }
}