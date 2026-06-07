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
    scene: [BootScene, OpeningScene, TitleScene, StartIntroScene, MainGameScene, TutorialScene, HubScene, SafeZone1Scene, SafeZone2Scene, SafeZone3Scene, SafeZone25Scene, SafeZone4Scene, SafeZone5Scene, SafeZone6Scene]
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

// (用户) 全局小字号字距: Phaser 3.60 没有 letterSpacing — 借 Canvas2D 的 ctx.letterSpacing (Chrome 99+)
//   关键教训: Phaser 画字前会重设画布尺寸, 而画布一重设, 2D 上下文状态(含 letterSpacing)全部清零 —
//   所以补丁必须打在 Canvas2D 原型层: 每次 measure/fill/stroke 时从 ctx.font 现解析字号、现设间距。
//   measureText 也打 → 宽度测量含字距, 换行/对齐/画布尺寸全部自洽; 不支持的浏览器静默跳过。
{
    const proto = CanvasRenderingContext2D.prototype;
    if (!proto._abyssLsPatched) {
        proto._abyssLsPatched = true;
        const want = (ctx) => {
            const m = /(\d+(?:\.\d+)?)px/.exec(ctx.font || '');
            return (m && parseFloat(m[1]) <= 18) ? '1px' : '0px';
        };
        // (用户) 全局灰字提亮 (商店/对话/设置/credits 全部生效): 只动低饱和灰色 —
        //   深灰档(如 #666677, 看不清) → 提到 #9aa6b5 那档; 中灰档(#9aa6b5 类) → 再亮一点但封顶不白;
        //   彩色字/纯黑描边/近黑近白全不动, 保持设计层级
        const _greyCache = new Map();
        const remapGrey = (c) => {
            if (typeof c !== 'string' || c[0] !== '#') return c;
            if (_greyCache.has(c)) return _greyCache.get(c);
            let out = c;
            const h = c.length === 4 ? '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : c;
            if (h.length === 7) {
                const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
                const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                const spread = Math.max(r, g, b) - Math.min(r, g, b);
                let target = 0;
                if (spread <= 36) {
                    if (L >= 75 && L < 140) target = 165;        // 深灰 → 可读中灰档
                    else if (L >= 140 && L < 185) target = 205;  // 中灰 → 亮灰 (不白)
                }
                if (target) {
                    const f = target / L;
                    const cv = (v) => Math.max(0, Math.min(235, Math.round(v * f)));
                    out = '#' + [cv(r), cv(g), cv(b)].map(v => v.toString(16).padStart(2, '0')).join('');
                }
            }
            _greyCache.set(c, out);
            return out;
        };
        ['measureText', 'fillText', 'strokeText'].forEach((fn) => {
            const orig = proto[fn];
            proto[fn] = function (...args) {
                try { if (this.letterSpacing !== undefined) this.letterSpacing = want(this); } catch (e) {}
                if (fn === 'fillText') { try { this.fillStyle = remapGrey(this.fillStyle); } catch (e) {} }
                return orig.apply(this, args);
            };
        });
    }
}

// (用户) 统一加载层 — 开局与进局内共用: 黑底 + 金色进度条 + 百分比 (id 与旧逻辑一致, 摘除机制不变)
window.AzmLoading = {
    show(label) {
        let div = document.getElementById('azm-scene-loading');
        if (!div) {
            div = document.createElement('div');
            div.id = 'azm-scene-loading';
            div.style.cssText = 'position:fixed;inset:0;background:#000;color:#cfcfcf;display:flex;flex-direction:column;align-items:center;justify-content:center;font:20px monospace;z-index:9999;letter-spacing:2px;';
            div.innerHTML = '<div id="azm-load-label" style="margin-bottom:14px;">Loading...</div>'
                + '<div style="width:320px;height:14px;background:#222230;border:2px solid #806020;">'
                + '<div id="azm-load-fill" style="width:0%;height:100%;background:#ffd86a;"></div></div>'
                + '<div id="azm-load-pct" style="margin-top:10px;font-size:14px;color:#8a8a99;">0%</div>';
            document.body.appendChild(div);
        }
        if (label) window.AzmLoading.setLabel(label);
        return div;
    },
    setLabel(t) { const e = document.getElementById('azm-load-label'); if (e) e.textContent = t; },
    setProgress(p) {
        const v = Math.round((p || 0) * 100) + '%';
        const f = document.getElementById('azm-load-fill'); if (f) f.style.width = v;
        const e = document.getElementById('azm-load-pct'); if (e) e.textContent = v;
    },
    hide() { const d = document.getElementById('azm-scene-loading'); if (d) d.remove(); }
};
window.AzmLoading.show('Loading...');

const game = new Phaser.Game(config);

// (用户) 切出网页再切回: canvas cursor='none' + 精灵光标停在旧位置, 玩家动鼠标前看不到任何指针.
//   修复: 重获焦点瞬间临时换回 CSS 自定义光标 (OS 按真实位置渲染), 首次移动/点击后交还精灵光标
game.events.once('ready', () => {
    const cv = game.canvas;
    const applyCssCursor = () => {
        try {
            const sc = (cv.clientWidth / cv.width) || 1;
            const hot = Math.round(32 * sc);
            cv.style.cursor = 'url(assets/images/Mouse_cursor.png) ' + hot + ' ' + hot + ', default';
            cv.style.cursor = '-webkit-image-set(url(assets/images/Mouse_cursor.png) ' + (1 / sc).toFixed(3) + 'x) ' + hot + ' ' + hot + ', default';
        } catch (e) {}
    };
    const onRefocus = () => {
        if (cv.style.cursor !== 'none') return;   // 仅精灵光标模式接管; StartIntro/Opening 的 CSS 模式不动
        applyCssCursor();
        const back = () => {
            cv.removeEventListener('pointermove', back);
            cv.removeEventListener('pointerdown', back);
            const sc0 = game.scene.getScenes(true)[0];
            if (sc0 && sc0.crosshair) {
                // (用户) 概率消失的元凶: 点击切回时 focus→换CSS→同一下点击立刻收回'none',
                //   但 pointermove 还没发生, 精灵停在旧位置 → 真实指针处空无一物.
                //   修复: 收回前先把精灵吸附到指针真实位置 (Phaser 的监听先于本监听, activePointer 已更新)
                const p = sc0.input && sc0.input.activePointer;
                if (p) { try { sc0.crosshair.setPosition(p.x, p.y); } catch (e) {} }
                cv.style.cursor = 'none';   // 有精灵光标的场景 → 收回 CSS
            }
        };
        cv.addEventListener('pointermove', back);
        cv.addEventListener('pointerdown', back);
    };
    window.addEventListener('focus', onRefocus);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) onRefocus(); });

    // (用户) 指针移出画面范围 (全屏黑边等) 时精灵会跟到镜头外 + canvas cursor:none → 两头都看不见.
    //   全局每帧把准星钳在画面边缘内: 越界时钉在边上保持可见 (标准游戏做法), 覆盖所有场景/缩放
    game.events.on('step', (t, dt) => {
        const sc0 = game.scene.getScenes(true)[0];
        const ch = sc0 && sc0.crosshair;
        if (ch && ch.active) {
            const W = game.scale.width, H = game.scale.height;
            if (ch.x < 8) ch.x = 8; else if (ch.x > W - 8) ch.x = W - 8;
            if (ch.y < 8) ch.y = 8; else if (ch.y > H - 8) ch.y = H - 8;
            // (用户) 自愈 1: 交接标志最长 1.5s — 清除定时器若被场景切换杀掉, 标志卡死会永久藏精灵
            if (sc0._cssCursorOverlap) {
                sc0._overlapMs = (sc0._overlapMs || 0) + (dt || 16);
                if (sc0._overlapMs > 1500) { sc0._cssCursorOverlap = false; sc0._overlapMs = 0; }
            } else sc0._overlapMs = 0;
            // (用户) 自愈 2: 不在交接期却被藏 → 强制拉回可见 (未知藏匿路径的总兜底)
            if (!sc0._cssCursorOverlap && !ch.visible) ch.setVisible(true);
            if (ch.alpha < 1) ch.setAlpha(1);   // 自愈 3: 被透明化也拉回
        }
    });
});

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