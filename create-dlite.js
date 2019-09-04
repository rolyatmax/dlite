const VERSION = '0.0.5'
// const { PicoGL } = require('./node_modules/picogl/src/picogl') // if you turn this on, you need to add -p esmify to the run cmd
const PicoGL = require('picogl')
const fit = require('canvas-fit')
const mapboxgl = require('mapbox-gl')
const mat4 = require('gl-mat4')
const vec4 = require('gl-vec4')
const {
  getViewMatrix,
  getDistanceScales,
  getProjectionParameters,
  lngLatToWorld,
  worldToPixels,
  pixelsToWorld,
  worldToLngLat
} = require('viewport-mercator-project')

const RETURN = `
`

module.exports = function createDlite (mapboxToken, initialViewState, mapStyle = 'mapbox://styles/mapbox/dark-v9', container = window) {
  mapboxgl.accessToken = mapboxToken

  const { center, zoom, bearing, pitch } = initialViewState

  const parentElement = container === window ? document.body : container
  const mapContainer = parentElement.appendChild(document.createElement('div'))
  mapContainer.style.width = '100vw'
  mapContainer.style.height = '100vh'
  mapContainer.style.position = 'fixed'
  mapContainer.style.top = mapContainer.style.left = 0

  const link = document.head.appendChild(document.createElement('link'))
  link.rel = 'stylesheet'
  link.href = 'https://api.tiles.mapbox.com/mapbox-gl-js/v0.54.0/mapbox-gl.css'

  const mapbox = new mapboxgl.Map({
    container: mapContainer,
    style: mapStyle,
    center: center,
    zoom: zoom,
    bearing: bearing,
    pitch: pitch,
    interactive: true
  })

  const onload = new Promise(resolve => {
    mapbox.on('load', resolve)
  })

  const dliteCanvas = parentElement.appendChild(document.createElement('canvas'))
  dliteCanvas.setAttribute('id', 'dlite-canvas')
  dliteCanvas.style['pointer-events'] = 'none' // let the user interact with the mapbox map below
  const resizeCanvas = fit(dliteCanvas, container)

  const picoApp = PicoGL.createApp(dliteCanvas)

  function resize () {
    resizeCanvas()
    picoApp.viewport(0, 0, dliteCanvas.width, dliteCanvas.height)
  }

  // TODO: provide a teardown function?
  window.addEventListener('resize', resize, false)

  function getCameraUniforms () {
    const [lng, lat] = mapbox.getCenter().toArray()
    const zoom = mapbox.getZoom()
    const bearing = mapbox.getBearing()
    const pitch = mapbox.getPitch()

    return getUniformsFromViewport({
      viewState: {
        width: dliteCanvas.width,
        height: dliteCanvas.height,
        longitude: lng,
        latitude: lat,
        bearing: bearing,
        pitch: pitch,
        zoom: zoom
        // nearZMultiplier = 0.1,
        // farZMultiplier = 10
      }
      // coordinateOrigin = DEFAULT_COORDINATE_ORIGIN,
      // wrapLongitude = false
    })
  }

  // { vs, fs, uniforms, vertexArray, primitive, count, instanceCount, framebuffer, parameters }
  function dlite (layerOpts) {
    const splitAt = layerOpts.vs.startsWith('#version 300 es') ? layerOpts.vs.indexOf(RETURN) + 1 : 0
    const head = layerOpts.vs.slice(0, splitAt)
    const body = layerOpts.vs.slice(splitAt)
    const vs = head + PROJECTION_GLSL + body
    const fs = layerOpts.fs || DEFAULT_FRAGMENT_SHADER

    let transformFeedback = null
    let transformFeedbackVaryings = null
    let curProgramTransformFeedbackVaryings = null
    if (layerOpts.transform) {
      transformFeedbackVaryings = Object.keys(layerOpts.transform).sort()
      curProgramTransformFeedbackVaryings = transformFeedbackVaryings.slice()
      transformFeedback = picoApp.createTransformFeedback()
      for (let i = 0; i < transformFeedbackVaryings.length; i++) {
        const varying = transformFeedbackVaryings[i]
        transformFeedback.feedbackBuffer(i, layerOpts.transform[varying])
      }
    }

    const program = picoApp.createProgram(vs, fs, transformFeedbackVaryings)
    let drawCall = picoApp.createDrawCall(program, layerOpts.vertexArray)

    const cameraProjectionUniformBuffer = picoApp.createUniformBuffer(cameraUniformTypesByPosition)

    // can pass in any updates to draw call EXCEPT vs and fs changes:
    // { uniforms, vertexArray, primitive, count, instanceCount, framebuffer, blend, depth, rasterize, cullBackfaces, parameters }
    return function render (renderOpts) {
      // the varyings just for this call
      let renderTransformVaryings = transformFeedbackVaryings
      if ('transform' in renderOpts) {
        transformFeedback = transformFeedback || picoApp.createTransformFeedback()
        renderTransformVaryings = Object.keys(renderOpts.transform).sort()
        // TODO: should we be updating these on every frame like this?
        for (let i = 0; i < renderTransformVaryings.length; i++) {
          const varying = renderTransformVaryings[i]
          transformFeedback.feedbackBuffer(i, renderOpts.transform[varying])
        }
      }

      // TODO: see if vertexArray has changed since last frame?? maybe end up owning vertexArray and attribute creation?
      // TODO: should we write over the drawCall like this or have this just persist through the end of this frame's render?
      const hasNewVaryings = !isEqualVaryings(curProgramTransformFeedbackVaryings, renderTransformVaryings)
      if ('vertexArray' in renderOpts || hasNewVaryings) {
        drawCall = picoApp.createDrawCall(program, renderOpts.vertexArray, renderTransformVaryings)
        curProgramTransformFeedbackVaryings = renderTransformVaryings
      }

      const blend = 'blend' in renderOpts ? renderOpts.blend : 'blend' in layerOpts ? layerOpts.blend : null
      if (blend !== null) {
        if (blend === false) {
          picoApp.noBlend()
        } else {
          picoApp.blend()
          picoApp.blendFuncSeparate(blend.csrc, blend.cdest, blend.asrc, blend.adest)
        }
      }

      const depth = 'depth' in renderOpts ? renderOpts.depth : 'depth' in layerOpts ? layerOpts.depth : null
      if (depth !== null) {
        if (depth === true) picoApp.depthTest()
        else picoApp.noDepthTest()
      }

      const rasterize = 'rasterize' in renderOpts ? renderOpts.rasterize : 'rasterize' in layerOpts ? layerOpts.rasterize : null
      if (rasterize !== null) {
        if (rasterize === true) picoApp.rasterize()
        else picoApp.noRasterize()
      }

      const cullBackfaces = 'cullBackfaces' in renderOpts ? renderOpts.cullBackfaces : 'cullBackfaces' in layerOpts ? layerOpts.cullBackfaces : null
      if (cullBackfaces !== null) {
        if (cullBackfaces === true) picoApp.cullBackfaces()
        else picoApp.drawBackfaces()
      }

      const framebuffer = 'framebuffer' in renderOpts ? renderOpts.framebuffer : 'framebuffer' in layerOpts ? layerOpts.framebuffer : null
      if (framebuffer === null) picoApp.defaultDrawFramebuffer()
      else picoApp.drawFramebuffer(framebuffer)

      const cameraUniforms = getCameraUniforms()
      for (let i = 0; i < cameraUniformsByPosition.length; i++) {
        const cameraUniformName = cameraUniformsByPosition[i]
        cameraProjectionUniformBuffer.set(i, cameraUniforms[cameraUniformName])
      }
      cameraProjectionUniformBuffer.update()
      drawCall.uniformBlock('DliteCameraProjectionUniforms', cameraProjectionUniformBuffer)

      const uniforms = {
        ...(('uniforms' in layerOpts) ? layerOpts.uniforms : {}),
        ...(('uniforms' in renderOpts) ? renderOpts.uniforms : {})
      }
      // TODO: make this work for texture uniforms and uniform blocks
      for (const name in uniforms) {
        drawCall.uniform(name, uniforms[name])
      }

      const primitive = 'primitive' in renderOpts ? renderOpts.primitive : 'primitive' in layerOpts ? layerOpts.primitive : null
      if (primitive !== null) drawCall.primitive(primitive)
      const count = 'count' in renderOpts ? renderOpts.count : 'count' in layerOpts ? layerOpts.count : null
      const instanceCount = 'instanceCount' in renderOpts ? renderOpts.instanceCount : 'instanceCount' in layerOpts ? layerOpts.instanceCount : null
      if (count !== null && instanceCount !== null) {
        drawCall.drawRanges([0, count, instanceCount])
      } else if (count !== null) {
        drawCall.drawRanges([0, count])
      }

      // if you've passed `null` for transform feedback, then use that instead of the stored transformFeedback
      const tf = ('transform' in renderOpts && !renderOpts.transform) ? null : transformFeedback
      drawCall.transformFeedback(tf)

      drawCall.draw()
    }
  }

  dlite.VERSION = VERSION
  dlite.mapbox = mapbox
  dlite.onload = onload
  dlite.picoApp = picoApp
  dlite.gl = picoApp.gl
  dlite.createVertexArray = picoApp.createVertexArray.bind(picoApp) // ??? merge other pico fns with the dlite object?
  dlite.createVertexBuffer = picoApp.createVertexBuffer.bind(picoApp) // ??? merge other pico fns with the dlite object?
  dlite.PicoGL = PicoGL
  dlite.clear = function clear (...color) {
    picoApp.clearColor(...color)
    picoApp.clear()
  }
  // todo: include project / unproject functions from mercator projection
  // dlite.project
  // dlite.unproject
  return dlite
}

// also accepts null values
function isEqualVaryings (arr1, arr2) {
  if (arr1 === null && arr2 === null) return true
  if (arr1 === null || arr2 === null) return false
  if (arr1.length !== arr2.length) return false
  let j = 0
  while (j < arr1.length) {
    if (arr1[j] !== arr2[j]) return false
    j += 1
  }
  return true
}

// this must match the order expected in the GLSL
const cameraUniformsByPosition = [
  'project_uModelMatrix',
  'project_uViewProjectionMatrix',
  'project_uCenter',
  'project_uCommonUnitsPerMeter', // TODO: make float (only z is used)
  'project_uCoordinateOrigin', // TODO: make vec2 (only xy is used)
  'project_uCommonUnitsPerWorldUnit',
  'project_uCommonUnitsPerWorldUnit2',
  'project_uCoordinateSystem', // TODO: make boolean (only values are 1 or 4)
  'project_uScale',
  'project_uAntimeridian',
  'project_uWrapLongitude'
]
// this must match the order expected in the GLSL
const cameraUniformTypesByPosition = [
  PicoGL.FLOAT_MAT4,
  PicoGL.FLOAT_MAT4,
  PicoGL.FLOAT_VEC4,
  PicoGL.FLOAT_VEC4, // vec3 but passed as vec4 to keep proper std140 buffer alignment
  PicoGL.FLOAT_VEC4, // vec3 but passed as vec4 to keep proper std140 buffer alignment
  PicoGL.FLOAT_VEC4, // vec3 but passed as vec4 to keep proper std140 buffer alignment
  PicoGL.FLOAT_VEC4, // vec3 but passed as vec4 to keep proper std140 buffer alignment
  PicoGL.FLOAT,
  PicoGL.FLOAT,
  PicoGL.FLOAT,
  PicoGL.BOOL
]

const PROJECTION_GLSL = `\
layout(std140) uniform DliteCameraProjectionUniforms {
  mat4 project_uModelMatrix;
  mat4 project_uViewProjectionMatrix;
  vec4 project_uCenter;
  vec4 project_uCommonUnitsPerMeter; // vec3 but passed as vec4 to keep proper std140 buffer alignment
  vec4 project_uCoordinateOrigin; // vec3 but passed as vec4 to keep proper std140 buffer alignment
  vec4 project_uCommonUnitsPerWorldUnit; // vec3 but passed as vec4 to keep proper std140 buffer alignment
  vec4 project_uCommonUnitsPerWorldUnit2; // vec3 but passed as vec4 to keep proper std140 buffer alignment
  float project_uCoordinateSystem;
  float project_uScale;
  float project_uAntimeridian;
  bool project_uWrapLongitude;
};

const float COORDINATE_SYSTEM_LNG_LAT = 1.;
const float COORDINATE_SYSTEM_LNGLAT_AUTO_OFFSET = 4.;
const float TILE_SIZE = 512.0;
const float PI = 3.1415926536;
const float WORLD_SCALE = TILE_SIZE / (PI * 2.0);

float project_size(float meters) {
  return meters * project_uCommonUnitsPerMeter.z;
}

vec2 project_mercator_(vec2 lnglat) {
  float x = lnglat.x;
  if (project_uWrapLongitude) {
    x = mod(x - project_uAntimeridian, 360.0) + project_uAntimeridian;
  }
  return vec2(
    radians(x) + PI, PI - log(tan(PI * 0.25 + radians(lnglat.y) * 0.5))
  );
}

vec4 project_offset_(vec4 offset) {
  float dy = clamp(offset.y, -1., 1.);
  vec3 commonUnitsPerWorldUnit = project_uCommonUnitsPerWorldUnit.xyz + project_uCommonUnitsPerWorldUnit2.xyz * dy;
  return vec4(offset.xyz * commonUnitsPerWorldUnit, offset.w);
}

vec4 project_position(vec4 position) {
  if (project_uCoordinateSystem == COORDINATE_SYSTEM_LNG_LAT) {
    return project_uModelMatrix * vec4(
      project_mercator_(position.xy) * WORLD_SCALE * project_uScale, project_size(position.z), position.w
    );
  }
  if (project_uCoordinateSystem == COORDINATE_SYSTEM_LNGLAT_AUTO_OFFSET) {
    float X = position.x - project_uCoordinateOrigin.x;
    float Y = position.y - project_uCoordinateOrigin.y;
    return project_offset_(vec4(X, Y, position.z, position.w));
  }
}

vec4 project_position_to_clipspace(vec3 position, vec3 offset) {
  vec4 projectedPosition = project_position(vec4(position, 1.0));
  vec4 commonPosition = vec4(projectedPosition.xyz + offset, 1.0);
  return project_uViewProjectionMatrix * commonPosition + project_uCenter;
}

vec4 project_position_to_clipspace(vec3 position) {
  vec3 offset = vec3(0);
  return project_position_to_clipspace(position, offset);
}

`

const DEFAULT_FRAGMENT_SHADER = `#version 300 es
precision highp float;
out vec4 fragColor;
void main() {
  fragColor = vec4(0);
}`

// --------------------------------------------------------------------------------------------------

// To quickly set a vector to zero
const ZERO_VECTOR = [0, 0, 0, 0]
// 4x4 matrix that drops 4th component of vector
const VECTOR_TO_POINT_MATRIX = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]
const IDENTITY_MATRIX = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const DEFAULT_COORDINATE_ORIGIN = [0, 0, 0]

// Based on viewport-mercator-project/test/fp32-limits.js
const LNGLAT_AUTO_OFFSET_ZOOM_THRESHOLD = 12

const COORD_SYSTEM = {
  LNG_LAT: 1,
  LNGLAT_AUTO_OFFSET: 4
}

/**
 * Projects xyz (possibly latitude and longitude) to pixel coordinates in window
 * using viewport projection parameters
 * - [longitude, latitude] to [x, y]
 * - [longitude, latitude, Z] => [x, y, z]
 * Note: By default, returns top-left coordinates for canvas/SVG type render
 *
 * @param {Array} lngLatZ - [lng, lat] or [lng, lat, Z]
 * @param {Object} opts - options
 * @param {Object} opts.topLeft=true - Whether projected coords are top left
 * @return {Array} - [x, y] or [x, y, z] in top left coords
 */
function project (xyz, { width, height, latitude, longitude, scale, pitch, bearing, altitude, nearZMultiplier, farZMultiplier, topLeft = true } = {}) {
  const projectionMatrix = getProjectionMatrix({ width, height, pitch, altitude, nearZMultiplier, farZMultiplier })
  const viewMatrix = getCenteredViewMatrix({ height, pitch, bearing, altitude, scale, longitude, latitude })
  const pixelProjectionMatrix = getPixelProjectionMatrix({ width, height, viewMatrix, projectionMatrix })
  const worldPosition = projectPosition(xyz, { latitude, longitude, scale })
  const coord = worldToPixels(worldPosition, pixelProjectionMatrix)

  const [x, y] = coord
  const y2 = topLeft ? y : height - y
  return xyz.length === 2 ? [x, y2] : [x, y2, coord[2]]
}

/**
 * Unproject pixel coordinates on screen onto world coordinates,
 * (possibly [lon, lat]) on map.
 * - [x, y] => [lng, lat]
 * - [x, y, z] => [lng, lat, Z]
 * @param {Array} xyz -
 * @param {Object} opts - options
 * @param {Object} opts.topLeft=true - Whether origin is top left
 * @return {Array|null} - [lng, lat, Z] or [X, Y, Z]
 */
function unproject (xyz, { width, height, latitude, longitude, scale, pitch, bearing, altitude, nearZMultiplier, farZMultiplier, topLeft = true, targetZ } = {}) {
  const [x, y, z] = xyz

  const distanceScales = getDistanceScales({ latitude, longitude, scale, highPrecision: true })
  const y2 = topLeft ? y : height - y
  const targetZWorld = targetZ && targetZ * distanceScales.pixelsPerMeter[2]

  const projectionMatrix = getProjectionMatrix({ width, height, pitch, altitude, nearZMultiplier, farZMultiplier })
  const viewMatrix = getCenteredViewMatrix({ height, pitch, bearing, altitude, scale, longitude, latitude })
  const pixelProjectionMatrix = getPixelProjectionMatrix({ width, height, viewMatrix, projectionMatrix })
  const pixelUnprojectionMatrix = mat4.invert([], pixelProjectionMatrix)

  const coord = pixelsToWorld([x, y2, z], pixelUnprojectionMatrix, targetZWorld)
  const [X, Y] = worldToLngLat(coord, scale)
  const Z = (xyz[2] || 0) * distanceScales.metersPerPixel[2]

  if (Number.isFinite(z)) {
    return [X, Y, Z]
  }
  return Number.isFinite(targetZ) ? [X, Y, targetZ] : [X, Y]
}

function getUniformsFromViewport ({
  viewState,
  coordinateOrigin = DEFAULT_COORDINATE_ORIGIN,
  wrapLongitude = false
}) {
  const modelMatrix = IDENTITY_MATRIX
  // might need nearZMultiplier & farZMultiplier to be customizable to match mapbox projection matrix?
  const { bearing, height, latitude, longitude, pitch, width, zoom, nearZMultiplier = 0.1, farZMultiplier = 10 } = viewState
  const scale = Math.pow(2, zoom)
  const altitude = Math.max(0.75, viewState.altitude || 1.5)

  const projectionMatrix = getProjectionMatrix({ width, height, pitch, altitude, nearZMultiplier, farZMultiplier })
  const viewMatrix = getCenteredViewMatrix({ height, pitch, bearing, altitude, scale, longitude, latitude })

  let viewProjectionMatrix = mat4.multiply([], projectionMatrix, viewMatrix)
  let projectionCenter, shaderCoordinateSystem, shaderCoordinateOrigin

  if (zoom < LNGLAT_AUTO_OFFSET_ZOOM_THRESHOLD) {
    // Use LNG_LAT projection if zoomed out
    shaderCoordinateSystem = COORD_SYSTEM.LNG_LAT
    shaderCoordinateOrigin = coordinateOrigin
    shaderCoordinateOrigin[2] = shaderCoordinateOrigin[2] || 0
    projectionCenter = ZERO_VECTOR
  } else {
    shaderCoordinateSystem = COORD_SYSTEM.LNGLAT_AUTO_OFFSET
    shaderCoordinateOrigin = [Math.fround(longitude), Math.fround(latitude), 0]

    const positionCommonSpace = projectPosition(shaderCoordinateOrigin, { latitude, longitude, scale })
    positionCommonSpace[3] = 1
    projectionCenter = vec4.transformMat4([], positionCommonSpace, viewProjectionMatrix)

    viewProjectionMatrix = mat4.multiply([], projectionMatrix, viewMatrix)
    // Zero out 4th coordinate ("after" model matrix) - avoids further translations
    viewProjectionMatrix = mat4.multiply([], viewProjectionMatrix, VECTOR_TO_POINT_MATRIX)
  }

  // Calculate projection pixels per unit
  const distanceScales = getDistanceScales({ latitude, longitude, scale, highPrecision: true })
  const distanceScalesAtOrigin = getDistanceScales({
    longitude: shaderCoordinateOrigin[0],
    latitude: shaderCoordinateOrigin[1],
    scale: scale,
    highPrecision: true
  })

  return {
    project_uModelMatrix: modelMatrix,
    project_uCoordinateSystem: shaderCoordinateSystem,
    project_uCenter: projectionCenter,
    project_uWrapLongitude: wrapLongitude,
    project_uAntimeridian: (longitude || 0) - 180,
    project_uCommonUnitsPerMeter: distanceScales.pixelsPerMeter,
    project_uCommonUnitsPerWorldUnit: distanceScalesAtOrigin.pixelsPerDegree,
    project_uCommonUnitsPerWorldUnit2: distanceScalesAtOrigin.pixelsPerDegree2,
    project_uScale: scale, // This is the mercator scale (2 ** zoom)
    project_uViewProjectionMatrix: viewProjectionMatrix,
    project_uCoordinateOrigin: shaderCoordinateSystem === COORD_SYSTEM.LNGLAT_AUTO_OFFSET ? shaderCoordinateOrigin : DEFAULT_COORDINATE_ORIGIN
  }
}

// Make a centered version of the matrix for projection modes without an offset
function getCenteredViewMatrix ({ height, pitch, bearing, altitude, scale, longitude, latitude }) {
  const vm = getViewMatrix({ height, pitch, bearing, altitude })
  // Flip Y to match the orientation of the Mercator plane
  const viewMatrixUncentered = mat4.scale([], vm, [1, -1, 1])
  const [centerX, centerY] = lngLatToWorld([longitude, latitude], scale)
  const translate = [-centerX, -centerY, 0]
  return mat4.translate(viewMatrixUncentered, viewMatrixUncentered, translate)
}

function getProjectionMatrix ({ width, height, pitch, altitude, nearZMultiplier, farZMultiplier }) {
  const { fov, near, far } = getProjectionParameters({ width, height, pitch, altitude, nearZMultiplier, farZMultiplier })
  return mat4.perspective([], fov, width / height, near, far)
}

// matrix for conversion from world location to screen (pixel) coordinates
function getPixelProjectionMatrix ({ width, height, viewMatrix, projectionMatrix }) {
  const viewProjectionMatrix = mat4.multiply([], projectionMatrix, viewMatrix)
  const viewportMatrix = mat4.identity()
  const pixelProjectionMatrix = mat4.identity() // matrix from world space to viewport.
  mat4.scale(viewportMatrix, viewportMatrix, [width / 2, -height / 2, 1])
  mat4.translate(viewportMatrix, viewportMatrix, [1, -1, 0])
  mat4.multiply(pixelProjectionMatrix, viewportMatrix, viewProjectionMatrix)
  return pixelProjectionMatrix
}

function projectPosition (xyz, { latitude, longitude, scale }) {
  const distanceScales = getDistanceScales({ latitude, longitude, scale, highPrecision: true })
  const [X, Y] = lngLatToWorld(xyz, scale)
  const Z = (xyz[2] || 0) * distanceScales.pixelsPerMeter[2]
  return [X, Y, Z]
}
