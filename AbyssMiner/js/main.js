const config = {
    type: Phaser.AUTO,
    pixelArt: true,        // 像素图用 NEAREST 过滤: 消除图片边缘那圈细黑线 (LINEAR 过滤的纹理边缘渗色), 同时让像素图更清晰
    roundPixels: true,     // 相机/精灵坐标取整, 避免亚像素采样再产生黑边
    backgroundColor: '#000000', // 纯黑 — 消除转场时露出的浅色闪屏 (与相机淡入淡出的黑一致)

    // 【新增这里】：全新的 Scale 缩放配置
    scale: {
        // FIT 模式：保持 1600x900 的比例，自动缩小或放大以填满整个浏览器窗口（不会变形）
        mode: Phaser.Scale.FIT, 
        // 自动将画布在网页中水平和垂直居中
        autoCenter: Phaser.Scale.CENTER_BOTH, 
        // 你的游戏原生逻辑分辨率
        width: 1600,
        height: 900
    },

    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 1750 },
            fps: 120,   // (用户修复) 冲刺 1600px/s 在 60Hz 下单步 26.7px, 贴近 32px 墙厚 → 斜穿墙角偶发隧穿; 120Hz 单步 13.3px 根治
            debug: false   // (用户) 全局关闭物理 hitbox 显示; SZ5 在场景内单独开启
        }
    },
    scene: [BootScene, OpeningScene, TitleScene, StartIntroScene, MainGameScene, TutorialScene, HubScene, SafeZone1Scene, SafeZone2Scene, SafeZone3Scene, SafeZone25Scene, SafeZone4Scene, SafeZone5Scene]
};

// (用户) 难度系统 — 中央配置. 存档记 difficulty 字段; easy = 现状不变
window.AbyssDiff = {
    mode: 'easy',
    TABLE: {
        easy:    { hearts: 5, corrTick: 1, potionCd: 0    , hpMul: 1,   dmgMul: 1,   shopLife: true,  priceMul: 1, cpRegen: true  },
        normal:  { hearts: 3, corrTick: 2, potionCd: 15000, hpMul: 1.5, dmgMul: 1,   shopLife: true,  priceMul: 1, cpRegen: true  },
        hard:    { hearts: 1, corrTick: 3, potionCd: 30000, hpMul: 2,   dmgMul: 1.5, shopLife: false, priceMul: 2, cpRegen: true  },
        extreme: { hearts: 1, corrTick: 4, potionCd: 45000, hpMul: 3,   dmgMul: 2,   shopLife: false, priceMul: 2, cpRegen: false }
    },
    get() { return this.TABLE[this.mode] || this.TABLE.easy; },
    set(m) { this.mode = this.TABLE[m] ? m : 'easy'; },
    // (用户) Extreme 解锁: 通关全游戏 >=1 次 (蜘蛛皇后死亡时 markCleared)
    isCleared() { try { return localStorage.getItem('abyssMinerCleared') === '1'; } catch (e) { return false; } },
    markCleared() { try { localStorage.setItem('abyssMinerCleared', '1'); } catch (e) {} }
};

const game = new Phaser.Game(config);

// (用户) GroundShaking: 任意场景主镜头在震动 → 循环播放; 震动一停 → 立即停止 (哪怕没播完)
//   挂游戏级 POST_STEP, 一处覆盖所有场景 (剧情震屏 / boss 咆哮 / golem 砸地全都响)
if (game && game.events) {
    let _gsSnd = null;
    game.events.on(Phaser.Core.Events.POST_STEP, () => {
        try {
            let shaking = false;
            const scs = game.scene.getScenes(true);
            for (let i = 0; i < scs.length; i++) {
                const cam = scs[i].cameras && scs[i].cameras.main;
                if (cam && cam.shakeEffect && cam.shakeEffect.isRunning) { shaking = true; break; }
            }
            if (shaking) {
                if (!_gsSnd && game.cache.audio.exists('GroundShaking')) {
                    _gsSnd = game.sound.add('GroundShaking', { loop: true, volume: 0.7 });
                }
                if (_gsSnd && !_gsSnd.isPlaying) _gsSnd.play();
            } else if (_gsSnd && _gsSnd.isPlaying) {
                _gsSnd.stop();
            }
        } catch (e) {}
    });
}
// (用户) Game.step 包裹 — window.onerror 对跨域脚本(CDN phaser)抛的错只给 "Script error.",
// 但同源 try/catch 拿到的 Error 对象不受脱敏: 任何 update/render 期崩溃这里必出完整栈
if (typeof Phaser !== 'undefined' && Phaser.Game && !Phaser.Game.prototype.__stepWrapped) {
    Phaser.Game.prototype.__stepWrapped = true;
    const _origStep = Phaser.Game.prototype.step;
    Phaser.Game.prototype.step = function (t, d) {
        try { _origStep.call(this, t, d); }
        catch (err) {
            try { console.error('[AbyssMiner STEP ERROR]', (err && err.stack) || err); } catch (_) {}
            throw err;
        }
    };
}

// (用户) 全局错误钩子 — 未捕获异常打完整调用栈 (压缩版 phaser 报错靠这个才能定位到游戏文件行号)
window.addEventListener('error', (e) => {
    try { console.error('[AbyssMiner ERROR]', (e.error && e.error.stack) || e.message); } catch (_) {}
});
window.addEventListener('unhandledrejection', (e) => {
    try { console.error('[AbyssMiner PROMISE ERROR]', (e.reason && e.reason.stack) || e.reason); } catch (_) {}
});