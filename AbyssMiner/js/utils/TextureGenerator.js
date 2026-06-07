/**
 * TextureGenerator
 * 程序化生成所有像素贴图。仅在 preload 调用一次。
 * 不保存任何状态。所有方法是 static。
 */
class TextureGenerator {
    /**
     * 生成所有贴图。在 GameScene.preload() 里调用一次。
     * @param {Phaser.Scene} scene
     */
    static generateAll(scene) {
        if (scene.textures.exists('__WHITE')) return;   // 已生成过 (贴图全局共享) → 跳过, 保证幂等 (Boot 场景预生成后各场景 preload 不再重复生成/刷屏)
        let g = scene.add.graphics();

        // 白色 1x1（用于图层底色）
        g.fillStyle(0xffffff).fillRect(0, 0, 1, 1); g.generateTexture('__WHITE', 1, 1);

        // 铁镐
        g.clear().fillStyle(0xffff00).fillRect(0, 0, 16, 16); g.generateTexture('pickaxe_img', 16, 16);

        // 准星
        g.clear().lineStyle(3, 0xffffff).arc(15, 15, 12, 0, Math.PI * 2).strokePath();
        g.lineStyle(2, 0xffffff).lineBetween(15, 3, 15, 27).lineBetween(3, 15, 27, 15);
        g.generateTexture('crosshair_custom', 30, 30);

        // 左右手图标
        g.clear().fillStyle(0xffffff).fillRect(0, 0, 10, 14); g.fillStyle(0x000000).fillRect(2, 2, 6, 2).fillRect(2, 6, 6, 2); g.generateTexture('left_hand_icon', 10, 14);
        g.clear().fillStyle(0xffffff).fillRect(0, 0, 10, 14); g.fillStyle(0x000000).fillRect(2, 2, 6, 2).fillRect(2, 6, 6, 2).fillRect(2, 10, 6, 2); g.generateTexture('right_hand_icon', 10, 14);

        // 怪物贴图
        g.clear().fillStyle(0x8800ff).fillRect(0, 8, 32, 16); g.fillStyle(0xffffff).fillRect(4, 12, 4, 4).fillRect(24, 12, 4, 4); g.generateTexture('spider_img', 32, 32);
        g.clear().fillStyle(0xaa44ff).fillRect(4, 8, 24, 14); g.fillStyle(0xffffff).fillRect(6, 11, 3, 3).fillRect(23, 11, 3, 3); g.generateTexture('bungee_spider_img', 32, 32);
        g.clear().fillStyle(0x334488).fillTriangle(16, 6, 0, 22, 32, 22); g.fillStyle(0x5566aa).fillRect(10, 14, 12, 8); g.generateTexture('bat_img', 32, 28);
        g.clear().fillStyle(0x995522).fillRect(0, 2, 48, 16); g.fillStyle(0xcc7733).fillRect(2, 4, 8, 10).fillRect(12, 4, 8, 10).fillRect(22, 4, 8, 10).fillRect(32, 4, 8, 10); g.generateTexture('earthworm_img', 48, 20);
        g.clear().fillStyle(0x00ffcc, 0.9).fillTriangle(10, 0, 0, 28, 20, 28); g.generateTexture('crystal_spike_img', 20, 28);
        g.clear().fillStyle(0x00cc66).fillEllipse(20, 16, 38, 28); g.fillStyle(0x00ffaa).fillEllipse(14, 12, 10, 8); g.generateTexture('slime_img', 40, 32);
        g.clear().fillStyle(0x009944).fillEllipse(13, 10, 26, 18); g.fillStyle(0x00cc77).fillEllipse(9, 7, 7, 5); g.generateTexture('mini_slime_img', 26, 20);
        g.clear().fillStyle(0x555555).fillRect(8, 4, 32, 22); g.fillStyle(0x888888).fillRect(8, 4, 8, 22); g.fillStyle(0x333333).fillRect(32, 4, 8, 22); g.generateTexture('beetle_img', 48, 30);
        // 爆裂水晶 - 白色基底（让 tint 能正确显示绿色）
        g.clear().fillStyle(0xffffff).fillTriangle(16, 0, 0, 32, 32, 32); g.fillStyle(0xeeeeee, 0.6).fillTriangle(16, 8, 8, 28, 24, 28); g.generateTexture('volatile_crystal_img', 32, 32);
        // 拟态矿石 - 白色基底（让 tint 能正确显示蓝色/紫色）
        g.clear().fillStyle(0xffffff).fillCircle(12, 12, 10); g.fillStyle(0xdddddd).fillCircle(9, 9, 4); g.generateTexture('mimic_ore_img', 24, 24);

        // 心形（左半 + 右半 + 护盾覆盖层）
        // 左半心
        g.clear().fillStyle(0xffffff);
        g.fillCircle(12, 12, 12);
        g.fillTriangle(0, 16, 24, 16, 24, 40);
        g.generateTexture('heart_half_left', 24, 48);

        // 右半心
        g.clear().fillStyle(0xffffff);
        g.fillCircle(12, 12, 12);
        g.fillTriangle(0, 16, 24, 16, 0, 40);
        g.generateTexture('heart_half_right', 24, 48);

        // 护盾覆盖层（完整心形，黄色半透明）
        g.clear().fillStyle(0xffff00, 0.75);
        g.fillCircle(12, 12, 12);
        g.fillCircle(36, 12, 12);
        g.fillTriangle(0, 16, 48, 16, 24, 40);
        g.generateTexture('heart_shield', 48, 48);

        // 水晶掉落物
        g.clear().fillStyle(0x00ffff).beginPath().moveTo(12, 0).lineTo(24, 12).lineTo(12, 24).lineTo(0, 12).closePath().fillPath();
        g.fillStyle(0xffffff, 0.4).beginPath().moveTo(12, 2).lineTo(20, 12).lineTo(12, 20).lineTo(4, 12).closePath().fillPath();
        g.generateTexture('drop_crystal_img', 24, 24);

        // === 药水贴图 ===
        // 治疗药水（粉红瓶 + 红液体 + 十字）
        g.clear();
        g.fillStyle(0xeeeeee).fillRect(12, 2, 8, 6);
        g.fillStyle(0xff4466).fillRoundedRect(4, 8, 24, 22, 6);
        g.fillStyle(0xffaacc, 0.4).fillRect(7, 11, 6, 15);
        g.fillStyle(0xffffff); g.fillRect(14, 14, 4, 10).fillRect(11, 17, 10, 4);
        g.generateTexture('potion_heal_img', 32, 32);

        // 护盾药水（蓝瓶 + 盾牌）— 已不卖 (阶段 5 改造), 保留贴图防旧存档报错
        g.clear();
        g.fillStyle(0xeeeeee).fillRect(12, 2, 8, 6);
        g.fillStyle(0x3366ff).fillRoundedRect(4, 8, 24, 22, 6);
        g.fillStyle(0x88aaff, 0.4).fillRect(7, 11, 6, 15);
        g.fillStyle(0xffff00);
        g.beginPath();
        g.moveTo(16, 12); g.lineTo(22, 15); g.lineTo(22, 22); g.lineTo(16, 27); g.lineTo(10, 22); g.lineTo(10, 15);
        g.closePath(); g.fillPath();
        g.generateTexture('potion_shield_img', 32, 32);

        // 增命药水（绿瓶 + 爱心 + 加号）— 阶段 5 新加
        g.clear();
        g.fillStyle(0xeeeeee).fillRect(12, 2, 8, 6);
        g.fillStyle(0x33cc44).fillRoundedRect(4, 8, 24, 22, 6);
        g.fillStyle(0x88ff99, 0.4).fillRect(7, 11, 6, 15);
        // 心形
        g.fillStyle(0xff4466);
        g.fillCircle(13, 17, 3.5);
        g.fillCircle(19, 17, 3.5);
        g.fillTriangle(10, 18, 22, 18, 16, 26);
        // 加号
        g.fillStyle(0xffffff);
        g.fillRect(22, 6, 2, 6).fillRect(20, 8, 6, 2);
        g.generateTexture('potion_life_img', 32, 32);

        // 健康药水（黄瓶 + 十字医疗）— 阶段 5 新加
        g.clear();
        g.fillStyle(0xeeeeee).fillRect(12, 2, 8, 6);
        g.fillStyle(0xffcc22).fillRoundedRect(4, 8, 24, 22, 6);
        g.fillStyle(0xffeeaa, 0.4).fillRect(7, 11, 6, 15);
        // 白色医疗十字
        g.fillStyle(0xffffff);
        g.fillRect(14, 14, 4, 10).fillRect(11, 17, 10, 4);
        g.generateTexture('potion_health_img', 32, 32);

        // 健康侦测仪（灰色仪器 + 心电图）— 阶段 5 新加
        g.clear();
        g.fillStyle(0x444444).fillRoundedRect(2, 6, 28, 20, 4);
        g.fillStyle(0x88ddff).fillRect(5, 9, 22, 12);  // 屏幕
        // 心电图线 (绿)
        g.fillStyle(0x33ff44);
        g.fillRect(6, 14, 4, 1);
        g.fillRect(10, 11, 1, 6);
        g.fillRect(11, 16, 2, 1);
        g.fillRect(13, 10, 1, 8);
        g.fillRect(14, 14, 6, 1);
        g.fillRect(20, 12, 1, 4);
        g.fillRect(21, 14, 5, 1);
        g.generateTexture('health_detector_img', 32, 32);

        // 钥匙贴图（黄色钥匙）
        g.clear();
        g.fillStyle(0xffcc00); // 黄色钥匙头
        g.fillCircle(8, 16, 6);
        g.fillStyle(0x000000);
        g.fillCircle(8, 16, 2);
        // 钥匙杆
        g.fillStyle(0xffcc00);
        g.fillRect(13, 14, 16, 4);
        // 钥匙齿
        g.fillRect(24, 18, 3, 4);
        g.fillRect(28, 18, 3, 4);
        g.generateTexture('key_img', 32, 32);

        // 地鼠商人（棕色地鼠 + 眼睛 + 金币装饰）
        g.clear();
        g.fillStyle(0x8b5a2b).fillEllipse(24, 32, 40, 44);
        g.fillStyle(0x6b4420).fillEllipse(24, 16, 28, 22);
        g.fillStyle(0xffffff).fillCircle(18, 15, 3).fillCircle(30, 15, 3);
        g.fillStyle(0x000000).fillCircle(18, 15, 2).fillCircle(30, 15, 2);
        g.fillStyle(0xffcccc).fillEllipse(24, 20, 6, 4);
        g.fillStyle(0xffffff).fillTriangle(20, 22, 24, 26, 22, 26);
        g.fillStyle(0xffffff).fillTriangle(26, 26, 28, 22, 26, 26);
        g.fillStyle(0xffd700).fillCircle(38, 42, 5);
        g.fillStyle(0xaa8800); g.lineStyle(1, 0x000000);
        g.generateTexture('mole_trader_img', 48, 56);

        g.destroy();
    }
}