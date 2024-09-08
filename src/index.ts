import L from "leaflet";

declare module "leaflet" {
    export interface Map {
        _zoom: number;
        _flyToFrame: number;
        _viewport: HTMLDivElement | undefined;
        _panAnim: PosAnimation;
        _limitZoom(zoom: number): number;
        _move(center: LatLngExpression, zoom?: number, data?: object, supressEvent?: boolean): this;
        _moveEnd(zoomChanged?: boolean): this;
        _moveStart(zoomChanged?: boolean, noMoveStart?: boolean): this;
        _stop(): this;
        setView(center: LatLngExpression, zoom?: number, options?: _ZoomPanOptions): this;
        getCenter(withoutViewport?: boolean): LatLng;
        getCenter(): LatLng;
        getViewport(): HTMLDivElement | undefined;
        getViewportBounds(): Bounds | undefined;
        getViewportLatLngBounds(): LatLngBounds | undefined;
        getOffset(): Point | undefined;
    }

    export interface ZoomOptions {
        animate?: boolean | undefined;
        noMoveStart?: boolean | undefined;
    }

    export interface PanOptions extends ZoomOptions {
        duration?: number | undefined;
        easeLinearity?: number | undefined;
    }

    type _ZoomPanOptions =
        | {
              zoom?: ZoomOptions;
              pan?: PanOptions;
          }
        | PanOptions;

    export interface InvalidateSizeOptions {
        animate?: boolean | undefined;
        pan?: boolean | undefined;
        debounceMoveend?: boolean | undefined;
    }

    export interface Renderer {
        _center: LatLng;
        _update(): void;
        _updateTransform(center: LatLngExpression, zoom: number): void;
    }

    export interface GridLayer {
        _container: HTMLDivElement;
        _level: _level;
        _levels: _levels;
        _loading: boolean;
        _onUpdateLevel(arg?: any): false;
        _onRemoveLevel(arg?: any): false;
        _onCreateLevel(arg?: any): false;
        _setView(center: LatLng, zoom: number, noPrune?: boolean, noUpdate?: boolean): void;
        _removeTilesAtZoom(zoom: number): void;
        _setZoomTransform(level: _level, center: LatLng, zoom: number): void;
        _clampZoom(zoom: number): number;
        _getTiledPixelBounds(center: LatLng): Bounds;
        _pxBoundsToTileRange(bounds: Bounds): Bounds;
        _isValidTile(coords: Coords): boolean;
        _addTile(coords: Coords, container: DocumentFragment): void;
        options: GridLayerOptions;
    }

    export interface _level {
        el: HTMLDivElement;
        origin: Point;
        zoom: number;
    }

    export interface _levels {
        [key: string]: _level;
    }

    export interface Popup {
        _container: HTMLDivElement;
        _containerWidth: number;
        _containerLeft: number;
        _containerBottom: number;
        _adjustPan(): void;
    }

    export interface Point {
        _add(point: Point): this;
    }

    export namespace Util {
        function falseFn(arg?: any): false;
    }
}

interface leafletActiveAreaProps {
    getCenter: L.Map["getCenter"];
    setView: L.Map["setView"];
    flyTo: L.Map["flyTo"];
    setZoomAround: L.Map["setZoomAround"];
    getBoundsZoom: L.Map["getBoundsZoom"];
    PopupAdjustPan(): void;
    RendererUpdate(): void;
}

declare global {
    interface Window {
        __leaflet_active_area: leafletActiveAreaProps | undefined;
    }
}

// for include type safety
function includeWrapper<T>(
    classRef: { include: (obj: object) => void },
    obj: { [key: string]: (this: T, ...args: any[]) => any }
) {
    classRef.include(obj);
}

(function (previousMethods: leafletActiveAreaProps | undefined) {
    if (!previousMethods) {
        // Defining previously that object allows you to use that plugin even if you have overridden L.map
        previousMethods = {
            getCenter: L.Map.prototype.getCenter,
            setView: L.Map.prototype.setView,
            flyTo: L.Map.prototype.flyTo,
            setZoomAround: L.Map.prototype.setZoomAround,
            getBoundsZoom: L.Map.prototype.getBoundsZoom,
            PopupAdjustPan: L.Popup.prototype._adjustPan,
            RendererUpdate: L.Renderer.prototype._update,
        };
    }

    includeWrapper<L.Map>(L.Map, {
        // Overrides L.Map.getBounds
        getBounds: function (): L.LatLngBounds | undefined {
            if (this._viewport) {
                return this.getViewportLatLngBounds();
            } else {
                const bounds = this.getPixelBounds();
                const sw = this.unproject(bounds.getBottomLeft());
                const ne = this.unproject(bounds.getTopRight());

                return new L.LatLngBounds(sw, ne);
            }
        },

        // Extends L.Map
        getViewport: function (): HTMLDivElement | undefined {
            return this._viewport;
        },

        // Extends L.Map
        getViewportBounds: function (): L.Bounds | undefined {
            let vp = this._viewport;
            if (vp) {
                let topleft = L.point(vp.offsetLeft, vp.offsetTop);
                let vpsize = L.point(vp.clientWidth, vp.clientHeight);

                if (vpsize.x === 0 || vpsize.y === 0) {
                    //Our own viewport has no good size - so we fallback to the container size:
                    vp = this.getContainer() as HTMLDivElement;
                    if (vp) {
                        topleft = L.point(0, 0);
                        vpsize = L.point(vp.clientWidth, vp.clientHeight);
                    }
                }

                return L.bounds(topleft, topleft.add(vpsize));
            }
        },

        // Extends L.Map
        getViewportLatLngBounds: function (): L.LatLngBounds | undefined {
            const bounds = this.getViewportBounds();
            if (bounds && bounds.min && bounds.max) {
                return L.latLngBounds(this.containerPointToLatLng(bounds.min), this.containerPointToLatLng(bounds.max));
            }
        },

        // Extends L.Map
        getOffset: function (): L.Point | undefined {
            const mCenter = this.getSize().divideBy(2);
            const viewportBounds = this.getViewportBounds();
            if (viewportBounds) {
                const vCenter = viewportBounds.getCenter();
                return mCenter.subtract(vCenter);
            }
        },

        // Overrides L.Map.getCenter
        getCenter: function (withoutViewport?: boolean): L.LatLng {
            let center = previousMethods.getCenter.call(this);

            if (this.getViewport() && !withoutViewport) {
                const zoom = this.getZoom();
                let point = this.project(center, zoom);

                const offset = this.getOffset();
                if (offset) {
                    point = point.subtract(offset);
                    center = this.unproject(point, zoom);
                }
            }

            return center;
        },

        // Overrides L.Map.setView
        setView: function (
            center:
                | L.LatLngTuple
                | [number, number, number]
                | L.LatLngLiteral
                | {
                      lat: number;
                      lng: number;
                      alt?: number | undefined;
                  },
            zoom: number,
            options: L.ZoomPanOptions
        ): L.Map {
            center = L.latLng(center);
            zoom = zoom === undefined ? this._zoom : this._limitZoom(zoom);

            if (this.getViewport()) {
                let point = this.project(center, this._limitZoom(zoom));

                const offset = this.getOffset();
                if (offset) {
                    point = point.add(offset);
                    center = this.unproject(point, this._limitZoom(zoom));
                }
            }

            return previousMethods.setView.call(this, center, zoom, options);
        },
        // Overrides L.Map.flyTo
        flyTo: function (
            targetCenter:
                | L.LatLngTuple
                | [number, number, number]
                | L.LatLngLiteral
                | {
                      lat: number;
                      lng: number;
                      alt?: number | undefined;
                  },
            targetZoom: number,
            options: L.ZoomPanOptions
        ): L.Map {
            const startZoom = this._zoom;
            targetCenter = L.latLng(targetCenter);
            targetZoom = targetZoom === undefined ? startZoom : targetZoom;

            if (this.getViewport()) {
                let point = this.project(targetCenter, this._limitZoom(targetZoom));
                const offset = this.getOffset();
                if (offset) {
                    point = point.add(offset);
                    targetCenter = this.unproject(point, this._limitZoom(targetZoom));
                }
            }

            options = options || {};
            if (options.animate === false || !L.Browser.any3d) {
                return this.setView(targetCenter, targetZoom, options);
            }

            this._stop();

            const from = this.project(previousMethods.getCenter.call(this));
            const to = this.project(targetCenter);
            const size = this.getSize();

            const w0 = Math.max(size.x, size.y);
            const w1 = w0 * this.getZoomScale(startZoom, targetZoom);
            const u1 = to.distanceTo(from) || 1;
            const rho = 1.42;
            const rho2 = rho * rho;

            function r(i: number): number {
                const s1 = i ? -1 : 1;
                const s2 = i ? w1 : w0;
                const t1 = w1 * w1 - w0 * w0 + s1 * rho2 * rho2 * u1 * u1;
                const b1 = 2 * s2 * rho2 * u1;
                const b = t1 / b1;
                const sq = Math.sqrt(b * b + 1) - b;

                // workaround for floating point precision bug when sq = 0, log = -Infinite,
                // thus triggering an infinite loop in flyTo
                const log = sq < 0.000000001 ? -18 : Math.log(sq);

                return log;
            }

            function sinh(n: number): number {
                return (Math.exp(n) - Math.exp(-n)) / 2;
            }
            function cosh(n: number): number {
                return (Math.exp(n) + Math.exp(-n)) / 2;
            }
            function tanh(n: number): number {
                return sinh(n) / cosh(n);
            }

            const r0 = r(0);

            function w(s: number): number {
                return w0 * (cosh(r0) / cosh(r0 + rho * s));
            }
            function u(s: number): number {
                return (w0 * (cosh(r0) * tanh(r0 + rho * s) - sinh(r0))) / rho2;
            }

            function easeOut(t: number): number {
                return 1 - Math.pow(1 - t, 1.5);
            }

            const start = Date.now();
            const S = (r(1) - r0) / rho;
            const duration = options.duration ? 1000 * options.duration : 1000 * S * 0.8;

            const frame = () => {
                const t = (Date.now() - start) / duration;
                const s = easeOut(t) * S;

                if (t <= 1) {
                    this._flyToFrame = L.Util.requestAnimFrame(frame, this);

                    this._move(
                        this.unproject(from.add(to.subtract(from).multiplyBy(u(s) / u1)), startZoom),
                        this.getScaleZoom(w0 / w(s), startZoom),
                        { flyTo: true }
                    );
                } else {
                    this._move(targetCenter, targetZoom)._moveEnd(true);
                }
            };

            this._moveStart(true, options.noMoveStart);

            frame.call(this);
            return this;
        },

        // Overrides L.Map.setZoomAround
        setZoomAround: function (latlng, zoom: number, options: L.ZoomOptions): L.Map {
            const vp = this.getViewport();
            const viewportBounds = this.getViewportBounds();

            if (vp && viewportBounds) {
                const scale = this.getZoomScale(zoom);
                const viewHalf = viewportBounds.getCenter();
                const containerPoint = latlng instanceof L.Point ? latlng : this.latLngToContainerPoint(latlng);
                const centerOffset = containerPoint.subtract(viewHalf).multiplyBy(1 - 1 / scale);
                const newCenter = this.containerPointToLatLng(viewHalf.add(centerOffset));

                return this.setView(newCenter, zoom, { zoom: options });
            } else {
                return previousMethods.setZoomAround.call(this, latlng, zoom, options);
            }
        },

        // Overrides L.Map.getBoundsZoom
        getBoundsZoom: function (bounds: L.LatLngBoundsExpression, inside?: boolean, padding?: L.Point): number {
            // (LatLngBounds[, Boolean, Point]) -> Number
            bounds = L.latLngBounds(bounds as L.LatLngTuple[]);
            padding = L.point(padding || [0, 0]);

            let zoom = this.getZoom() || 0;
            const min = this.getMinZoom();
            const max = this.getMaxZoom();
            const nw = bounds.getNorthWest();
            const se = bounds.getSouthEast();
            const vp = this.getViewport();
            const size = (vp ? L.point(vp.clientWidth, vp.clientHeight) : this.getSize()).subtract(padding);
            const boundsSize = this.project(se, zoom).subtract(this.project(nw, zoom));
            const snap: number | undefined = L.Browser.any3d ? this.options.zoomSnap : 1;
            const scalex = size.x / boundsSize.x;
            const scaley = size.y / boundsSize.y;
            const scale = inside ? Math.max(scalex, scaley) : Math.min(scalex, scaley);

            zoom = this.getScaleZoom(scale, zoom);

            if (snap) {
                zoom = Math.round(zoom / (snap / 100)) * (snap / 100); // don't jump if within 1% of a snap level
                zoom = inside ? Math.ceil(zoom / snap) * snap : Math.floor(zoom / snap) * snap;
            }

            return Math.max(min, Math.min(max, zoom));
        },

        // Extends L.Map
        setActiveArea: function (css, keepCenter, animate): L.Map {
            let center;
            if (keepCenter && this._zoom) {
                // save center if map is already initialized
                // and keepCenter is passed
                center = this.getCenter();
            }

            if (!this._viewport) {
                //Make viewport if not already made
                const container = this.getContainer();
                this._viewport = L.DomUtil.create("div", "");
                container.insertBefore(this._viewport, container.firstChild);
            }

            if (typeof css === "string") {
                this._viewport.className = css;
            } else {
                L.extend(this._viewport.style, css);
            }

            if (center) {
                this.setView(center, this.getZoom(), { animate: !!animate });
            }
            return this;
        },
    });

    includeWrapper<L.Renderer>(L.Renderer, {
        // Overrides L.Renderer._onZoom
        _onZoom: function (): void {
            // the variable _map is protected and because of the the way we are
            // extending this class (using L.Renderer.include()), typescript
            // doesn't know we are actually accessing it from the inside
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            this._updateTransform(this._map.getCenter(true), this._map.getZoom());
        },

        // Overrides L.Renderer._update
        _update: function (): void {
            previousMethods.RendererUpdate.call(this);
            // the variable _map is protected and because of the the way we are
            // extending this class (using L.Renderer.include()), typescript
            // doesn't know we are actually accessing it from the inside
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            this._center = this._map.getCenter(true);
        },
    });

    includeWrapper<L.GridLayer>(L.GridLayer, {
        // Overrides L.GridLayer._updateLevels
        _updateLevels: function (): L._level | undefined {
            // the variable _tileZoom is protected and because of the the way we are
            // extending this class (using L.GridLayer.include()), typescript
            // doesn't know we are actually accessing it from the inside
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const zoom = this._tileZoom;
            const maxZoom = this.options.maxZoom;

            if (zoom === undefined) {
                return undefined;
            }

            for (const z in this._levels) {
                let z_num: number = Number(z);
                if (this._levels[z_num]) {
                    if (this._levels[z_num].el.children.length || z_num === zoom) {
                        this._levels[z_num].el.style.zIndex = maxZoom
                            ? (maxZoom - Math.abs(zoom - z_num)).toString()
                            : "";
                        this._onUpdateLevel(z_num);
                    } else {
                        L.DomUtil.remove(this._levels[z_num].el);
                        this._removeTilesAtZoom(z_num);
                        this._onRemoveLevel(z_num);
                        delete this._levels[z_num];
                    }
                }
            }

            let level = this._levels[zoom];
            // the variable _map is protected and because of the the way we are
            // extending this class (using L.GridLayer.include()), typescript
            // doesn't know we are actually accessing it from the inside
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const map = this._map;

            if (!level) {
                level = this._levels[zoom] = {} as L._level;

                level.el = L.DomUtil.create("div", "leaflet-tile-container leaflet-zoom-animated", this._container);
                level.el.style.zIndex = maxZoom ? maxZoom.toString() : "";

                level.origin = map.project(map.unproject(map.getPixelOrigin()), zoom).round();
                level.zoom = zoom;

                this._setZoomTransform(level, map.getCenter(true), map.getZoom());

                // force the browser to consider the newly added element for transition
                L.Util.falseFn(level.el.offsetWidth);

                this._onCreateLevel(level);
            }

            this._level = level;

            return level;
        },

        // Overrides L.GridLayer._resetView
        _resetView: function (e: { pinch?: boolean; flyTo?: boolean }) {
            const animating = e && (e.pinch || e.flyTo);
            // the variable _map is protected and because of the the way we are
            // extending this class (using L.GridLayer.include()), typescript
            // doesn't know we are actually accessing it from the inside
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            this._setView(this._map.getCenter(true), this._map.getZoom(), animating, animating);
        },

        // Overrides L.GridLayer._update
        _update: function (center: L.LatLng): void {
            // the variable _map is protected and because of the the way we are
            // extending this class (using L.GridLayer.include()), typescript
            // doesn't know we are actually accessing it from the inside
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const map = this._map;
            if (!map) {
                return;
            }
            const zoom = this._clampZoom(map.getZoom());

            if (center === undefined) {
                center = map.getCenter(true);
            }

            // the variable _tileZoom is protected and because of the the way we are
            // extending this class (using L.GridLayer.include()), typescript
            // doesn't know we are actually accessing it from the inside
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            if (this._tileZoom === undefined) {
                return;
            } // if out of minzoom/maxzoom

            const pixelBounds = this._getTiledPixelBounds(center);
            const tileRange = this._pxBoundsToTileRange(pixelBounds);
            const tileCenter = tileRange.getCenter();
            const queue: L.Coords[] = [];
            const margin = this.options.keepBuffer as number;
            const noPruneRange = new L.Bounds(
                tileRange.getBottomLeft().subtract([margin, -margin]),
                tileRange.getTopRight().add([margin, -margin])
            );

            // Sanity check: panic if the tile range contains Infinity somewhere.
            if (
                tileRange.min &&
                tileRange.max &&
                !(
                    isFinite(tileRange.min.x) &&
                    isFinite(tileRange.min.y) &&
                    isFinite(tileRange.max.x) &&
                    isFinite(tileRange.max.y)
                )
            ) {
                throw new Error("Attempted to load an infinite number of tiles");
            }

            // the variable _tiles is protected and because of the the way we are
            // extending this class (using L.GridLayer.include()), typescript
            // doesn't know we are actually accessing it from the inside
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            for (const key in this._tiles) {
                // the variable _tiles is protected and because of the the way we are
                // extending this class (using L.GridLayer.include()), typescript
                // doesn't know we are actually accessing it from the inside
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                const c = this._tiles[key].coords;

                // the variable _tileZoom is protected and because of the the way we are
                // extending this class (using L.GridLayer.include()), typescript
                // doesn't know we are actually accessing it from the inside
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                if (c.z !== this._tileZoom || !noPruneRange.contains(new L.Point(c.x, c.y))) {
                    // the variable _tiles is protected and because of the the way we are
                    // extending this class (using L.GridLayer.include()), typescript
                    // doesn't know we are actually accessing it from the inside
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    this._tiles[key].current = false;
                }
            }

            // _update just loads more tiles. If the tile zoom level differs too much
            // from the map's, let _setView reset levels and prune old tiles.
            // the variable _tileZoom is protected and because of the the way we are
            // extending this class (using L.GridLayer.include()), typescript
            // doesn't know we are actually accessing it from the inside
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            if (Math.abs(zoom - this._tileZoom) > 1) {
                this._setView(center, zoom);
                return;
            }

            if (tileRange.min && tileRange.max) {
                // create a queue of coordinates to load tiles from
                for (let j = tileRange.min.y; j <= tileRange.max.y; j++) {
                    for (let i = tileRange.min.x; i <= tileRange.max.x; i++) {
                        const coords = new L.Point(i, j) as L.Coords;
                        // the variable _tileZoom is protected and because of the the way we are
                        // extending this class (using L.GridLayer.include()), typescript
                        // doesn't know we are actually accessing it from the inside
                        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                        // @ts-ignore
                        coords.z = this._tileZoom;

                        if (!this._isValidTile(coords)) {
                            continue;
                        }

                        // the variable _tiles and the function _tileCoordsToKey() is protected
                        // and because of the the way we are extending this class (using L.GridLayer.include()),
                        // typescript doesn't know we are actually accessing it from the inside
                        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                        // @ts-ignore
                        const tile = this._tiles[this._tileCoordsToKey(coords)];
                        if (tile) {
                            tile.current = true;
                        } else {
                            queue.push(coords);
                        }
                    }
                }
                // sort tile queue to load tiles in order of their distance to center
                queue.sort(function (a, b) {
                    return a.distanceTo(tileCenter) - b.distanceTo(tileCenter);
                });
            }

            if (queue.length !== 0) {
                // if it's the first batch of tiles to load
                if (!this._loading) {
                    this._loading = true;
                    // @event loading: Event
                    // Fired when the grid layer starts loading tiles.
                    this.fire("loading");
                }

                // create DOM fragment to append tiles in one batch
                const fragment = document.createDocumentFragment();

                queue.forEach((q) => {
                    this._addTile(q, fragment);
                });

                this._level.el.appendChild(fragment);
            }
        },
    });

    includeWrapper<L.Popup>(L.Popup, {
        // Overrides L.Popup._adjustPan
        _adjustPan: function (): void {
            // the variable _map is protected and because of the the way we are
            // extending this class (using L.Popup.include()), typescript
            // doesn't know we are actually accessing it from the inside
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const vp = this._map._viewport;
            if (!vp) {
                previousMethods.PopupAdjustPan.call(this);
            } else {
                if (!this.options.autoPan) {
                    return;
                }
                // the variable _map is protected and because of the the way we are
                // extending this class (using L.Popup.include()), typescript
                // doesn't know we are actually accessing it from the inside
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                if (this._map._panAnim) {
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    this._map._panAnim.stop();
                }

                // the variable _map is protected and because of the the way we are
                // extending this class (using L.Popup.include()), typescript
                // doesn't know we are actually accessing it from the inside
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                const map = this._map;
                const containerHeight = this._container.offsetHeight;
                const containerWidth = this._containerWidth;
                const vpTopleft = L.point(vp.offsetLeft, vp.offsetTop);
                const layerPos = new L.Point(
                    this._containerLeft - vpTopleft.x,
                    -containerHeight - this._containerBottom - vpTopleft.y
                );

                layerPos._add(L.DomUtil.getPosition(this._container));

                const containerPos = map.layerPointToContainerPoint(layerPos);
                const padding = L.point(this.options.autoPanPadding as L.PointTuple);
                const paddingTL = L.point(this.options.autoPanPaddingTopLeft || padding);
                const paddingBR = L.point(this.options.autoPanPaddingBottomRight || padding);
                const size = L.point(vp.clientWidth, vp.clientHeight);
                let dx = 0;
                let dy = 0;

                if (containerPos.x + containerWidth + paddingBR.x > size.x) {
                    // right
                    dx = containerPos.x + containerWidth - size.x + paddingBR.x;
                }
                if (containerPos.x - dx - paddingTL.x < 0) {
                    // left
                    dx = containerPos.x - paddingTL.x;
                }
                if (containerPos.y + containerHeight + paddingBR.y > size.y) {
                    // bottom
                    dy = containerPos.y + containerHeight - size.y + paddingBR.y;
                }
                if (containerPos.y - dy - paddingTL.y < 0) {
                    // top
                    dy = containerPos.y - paddingTL.y;
                }

                // @namespace Map
                // @section Popup events
                // @event autopanstart: Event
                // Fired when the map starts autopanning when opening a popup.
                if (dx || dy) {
                    map.fire("autopanstart").panBy([dx, dy]);
                }
            }
        },
    });
})(window.__leaflet_active_area);
