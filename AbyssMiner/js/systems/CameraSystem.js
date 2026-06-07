class CameraSystem {
    constructor(camera, player) {
        this.camera = camera;
        this.player = player;
        this.lerpX = 0.08;
        this.lerpY = 0.08;
        this.deadzoneWidth = 30;
        this.deadzoneHeight = 30;
    }

    setup(worldWidth, worldHeight) {
        this.camera.setBounds(0, 0, worldWidth, worldHeight);
        this.camera.startFollow(this.player, true, this.lerpX, this.lerpY);
        this.camera.setDeadzone(this.deadzoneWidth, this.deadzoneHeight);
        this.camera.setRoundPixels(false);
        this.camera.setFollowOffset(0, 0);
    }

    setupUICamera(scene) {
        const mainCam = this.camera;
        const uiCam = scene.cameras.add(0, 0, mainCam.width, mainCam.height);
        uiCam.setScroll(0, 0);
        uiCam.setZoom(1);

        // 严格 ignore：必须是真 Phaser GameObject 或 Group
        const isValidPhaserObject = (obj) => {
            if (!obj) return false;
            // GameObject 有 scene + displayList 或 parentContainer 属性概念
            // Group 有 children 属性
            // 排除普通 JS 对象（{body:null, state:...}）
            return (typeof obj.setActive === 'function')   // GameObject
                || (obj.children !== undefined && typeof obj.getChildren === 'function');  // Group
        };
        const safeIgnore = (cam, obj) => {
            if (!isValidPhaserObject(obj)) return;
            try { cam.ignore(obj); } catch (e) { /* skip */ }
        };

        // === UI 对象（主相机 ignore）===
        if (scene.healthSystem && scene.healthSystem.heartSprites) {
            scene.healthSystem.heartSprites.forEach(p => {
                safeIgnore(mainCam, p.left);
                safeIgnore(mainCam, p.right);
            });
        }
        if (scene.healthSystem && scene.healthSystem.shieldOverlays) {
            scene.healthSystem.shieldOverlays.forEach(s => safeIgnore(mainCam, s));
        }
        // 新 HP 条 UI (阶段 3)
        if (scene.healthSystem) {
            ['hpBarBg', 'hpBarFill', 'hpBarBorder', 'hpText', 'heartsText'].forEach(k => {
                safeIgnore(mainCam, scene.healthSystem[k]);
            });
        }
        // 腐蚀度条 UI (阶段 4)
        if (scene.diseaseSystem) {
            ['corrosionBg', 'corrosionFill', 'corrosionBorder', 'corrosionLine20', 'corrosionLine50', 'corrosionText'].forEach(k => {
                safeIgnore(mainCam, scene.diseaseSystem[k]);
            });
        }
        safeIgnore(mainCam, scene.healthSystem && scene.healthSystem.deathPanel);
        safeIgnore(mainCam, scene.hudSystem && scene.hudSystem.crystalIcon);
        safeIgnore(mainCam, scene.hudSystem && scene.hudSystem.crystalText);
        safeIgnore(mainCam, scene.hudSystem && scene.hudSystem.confirmPanel);
        if (scene.inventorySystem) {
            ['slotBg','slotIcons','slotCountText','slotCooldownOverlay','slotLabels'].forEach(k => {
                if (scene.inventorySystem[k]) {
                    scene.inventorySystem[k].forEach(o => safeIgnore(mainCam, o));
                }
            });
        }
        // 鼠标 + 左右手指示器：让 mainCam ignore (只在 uiCam 渲染) → 永远在最上层不被 fog 影响
        safeIgnore(mainCam, scene.crosshair);
        safeIgnore(mainCam, scene.leftHandIndicator);
        safeIgnore(mainCam, scene.rightHandIndicator);

        // BackpackSystem：让主相机 ignore 所有 UI 物件（避免双屏幕）
        if (scene.backpackSystem && typeof scene.backpackSystem.getAllUIObjects === 'function') {
            scene.backpackSystem.getAllUIObjects().forEach(o => safeIgnore(mainCam, o));
        }
        // SettingsSystem
        if (scene.settingsSystem && typeof scene.settingsSystem.getAllUIObjects === 'function') {
            scene.settingsSystem.getAllUIObjects().forEach(o => safeIgnore(mainCam, o));
        }
        // CreativeSystem
        if (scene.creativeSystem && typeof scene.creativeSystem.getAllUIObjects === 'function') {
            scene.creativeSystem.getAllUIObjects().forEach(o => safeIgnore(mainCam, o));
        }
        // DialogSystem
        if (scene.dialogSystem && typeof scene.dialogSystem.getAllUIObjects === 'function') {
            scene.dialogSystem.getAllUIObjects().forEach(o => safeIgnore(mainCam, o));
        }
        // QuestSystem
        if (scene.questSystem && typeof scene.questSystem.getAllUIObjects === 'function') {
            scene.questSystem.getAllUIObjects().forEach(o => safeIgnore(mainCam, o));
        }
        // HUD guide button
        safeIgnore(mainCam, scene.hudSystem && scene.hudSystem.guideBtn);
        // HUD 右上角按钮
        if (scene.hudSystem && scene.hudSystem._topBtns) {
            scene.hudSystem._topBtns.forEach(b => safeIgnore(mainCam, b));
        }
        // ShopSystem 商店面板（避免双屏幕）
        safeIgnore(mainCam, scene.shopSystem && scene.shopSystem.panel);

        // === 世界对象（UI 相机 ignore，注意 crosshair 已不在此列表）===
        const worldList = [
            scene.player, scene.pick1, scene.pick2,
            scene.walls, scene.droppedCrystals,
            scene.spiders, scene.bungeeSpiders, scene.bats, scene.earthworms,
            scene.slimes, scene.miniSlimes, scene.beetles, scene.volatileCrystals,
            scene.mimicOres, scene.cowardMimics,
            scene.ropeGraphics, scene.monsterGraphics, scene._gridGraphics,
            scene.fg, scene.bg
        ];
        // FogSystem 的 graphics 让 uiCam ignore
        if (scene.fogSystem && scene.fogSystem.gfx) worldList.push(scene.fogSystem.gfx);
        if (scene.fogSystem && scene.fogSystem.gradGfx) worldList.push(scene.fogSystem.gradGfx);   // (用户) 渐变层同样只在主相机
        // 【修复主场景显示】：兼容 _npcMole 和 moleTrader 两种写法
        const trader = scene._npcMole || scene.moleTrader;
        if (trader) {
            worldList.push(trader);
            if (trader.interactionIcon) {
             worldList.push(trader.interactionIcon);
            }
        }
        worldList.forEach(o => safeIgnore(uiCam, o));

        // 标记 worldList 对象不要被自动分类为 UI（即使 scrollFactor=0）
        const worldListSet = new Set(worldList.filter(o => o));
        const isWorldListItem = (obj) => worldListSet.has(obj);

        // 根本方案：扫描所有 children，根据 parentContainer 的 scrollFactor 分类
        const ignoreWorldObjects = () => {
            scene.children.list.forEach(obj => {
                if (!obj || !isValidPhaserObject(obj)) return;
                if (isWorldListItem(obj)) return;  // worldList 已显式处理
                let target = obj;
                while (target.parentContainer) target = target.parentContainer;
                // depth < -100 强制视为世界背景层 (不管 sf 是不是 0)
                const depth = (target.depth !== undefined) ? target.depth : 0;
                if (depth < -100) {
                    safeIgnore(uiCam, obj);
                    return;
                }
                const sfX = target.scrollFactorX !== undefined ? target.scrollFactorX : 1;
                const sfY = target.scrollFactorY !== undefined ? target.scrollFactorY : 1;
                if (sfX !== 0 || sfY !== 0) {
                    safeIgnore(uiCam, obj);
                } else {
                    safeIgnore(mainCam, obj);
                }
            });
        };
        ignoreWorldObjects();
        scene.time.delayedCall(50, ignoreWorldObjects);
        scene.time.delayedCall(500, ignoreWorldObjects);

        // 显式 ignore 所有 group 的 children（walls / platforms / bgBlocks 等）
        ['walls', 'platforms', 'bgBlocks', 'crystalBlocks', 'spiders', 'bungeeSpiders',
         'bats', 'earthworms', 'slimes', 'miniSlimes', 'beetles', 'volatileCrystals',
         'mimicOres', 'cowardMimics', 'droppedCrystals'].forEach(groupName => {
            const group = scene[groupName];
            if (group && group.getChildren) {
                group.getChildren().forEach(c => safeIgnore(uiCam, c));
            }
        });

        // 让所有以后新建的对象自动被两个相机分别检查（延迟一帧，等 setScrollFactor / container.add 调完）
        const classifyObject = (obj) => {
            if (!obj || !obj.scene) return;
            if (isWorldListItem(obj)) return;  // worldList 已显式处理
            // 优先看 parentContainer 的 scrollFactor
            let target = obj;
            while (target.parentContainer) target = target.parentContainer;
            // depth < -100 强制视为世界背景层 (不管 sf 是不是 0)
            const depth = (target.depth !== undefined) ? target.depth : 0;
            if (depth < -100) {
                safeIgnore(uiCam, obj);
                return;
            }
            const sfX = target.scrollFactorX !== undefined ? target.scrollFactorX : 1;
            const sfY = target.scrollFactorY !== undefined ? target.scrollFactorY : 1;
            if (sfX !== 0 || sfY !== 0) {
                safeIgnore(uiCam, obj);
            } else {
                safeIgnore(mainCam, obj);
            }
        };
        scene.events.on('addedtoscene', (obj) => {
            if (!obj || !isValidPhaserObject(obj)) return;
            scene.time.delayedCall(0, () => classifyObject(obj));
            scene.time.delayedCall(50, () => classifyObject(obj));
        });

        const ignoreDebug = () => {
            if (scene.physics.world.debugGraphic) safeIgnore(uiCam, scene.physics.world.debugGraphic);
        };
        scene.time.delayedCall(1, ignoreDebug);
        scene.time.delayedCall(100, ignoreDebug);
        scene.time.delayedCall(500, ignoreDebug);

        scene.events.on('slime_split', () => {
            scene.time.delayedCall(1, () => {
                if (scene.miniSlimes) scene.miniSlimes.getChildren().forEach(m => safeIgnore(uiCam, m));
            });
        });

        return uiCam;
    }
}