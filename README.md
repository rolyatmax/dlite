# dlite
deck.gl, but lighter

```bash
$ npm i && npm start
```

### Tiny example

```js
const createDlite = require('dlite')

const dlite = createDlite(MAPBOX_TOKEN, {
  center: [-122.423175, 37.778316],
  zoom: 14,
  bearing: 0,
  pitch: 15
})

const positions = dlite.picoApp.createVertexBuffer(dlite.PicoGL.FLOAT, 2, new Float32Array([
  -122.42314, 37.77831,
  -122.42317, 37.77834,
  -122.423165, 37.7784
]))
const vertexArray = dlite.picoApp.createVertexArray().vertexAttributeBuffer(0, positions)

const renderPoints = dlite({
  vs: `#version 300 es
  precision highp float;
  layout(location=0) in vec2 position;
  uniform float size;
  void main() {
    vec3 offset = vec3(0.0);
    gl_Position = project_position_to_clipspace(position, offset);
    gl_PointSize = size;
  }`,

  fs: `#version 300 es
  precision highp float;
  uniform float opacity;
  out vec4 fragColor;
  void main() {
    fragColor = vec4(0.5, 0.7, 0.9, opacity);
  }`,

  vertexArray: vertexArray,
  count: 3,
  primitive: dlite.PicoGL.POINTS,
  blend: {
    csrc: dlite.PicoGL.SRC_ALPHA,
    cdest: dlite.PicoGL.ONE_MINUS_SRC_ALPHA,
    asrc: dlite.PicoGL.ONE,
    adest: dlite.PicoGL.ONE
  }
})

dlite.clear(0, 0, 0, 0)
renderPoints({
  uniforms: {
    size: 5,
    opacity: 0.8
  }
})
```

### API

#### `createDlite(mapboxToken, initialViewState)`

Takes a `mapboxToken` (`string`) and `initialViewState` (`object`) which looks like:
```js
{
  center: [longitude, latitude],
  zoom: zoomLevel, // in powers of 2, number
  bearing: bearing, // in degrees, number between -180 and +180
  pitch: pitch // in degrees, number between 0 and 60
}
```

Returns a `dlite` function which can be used to create WebGL resources and render functions.

Example:
```js
const dlite = createDlite(MAPBOX_TOKEN, {
  center: [-122.423175, 37.778316],
  zoom: 14,
  bearing: 0,
  pitch: 15
})
```

#### `dlite(options)`

Takes render `options` which are used to generate a render function. The render `options` object looks like:
```js
{
  vs: vertexShaderSource, // the source of the vertex shader (string)
  fs: fragmentShaderSource, // the source of the fragment shader (string) (optional for transform feedback pass)
  vertexArray: vertexArray, // a PicoGL vertexArray object - dlite.picoApp.createVertexArray()
  transform: { // an object containing a mapping of varyings to output buffers (optional)
    varyingName1: vertexBuffer1,
  },
  uniforms: uniformsObject, // a JavaScript object with uniforms (optional)
  count: vertexCount, // the number of attribute vertices to draw (optional)
  instanceCount: instanceCount, // the number of instances to draw (optional)
  primitive: glDrawPrimitive, // the GL draw primitive, default is GL.TRIANGLES (optional)
  framebuffer: framebuffer, // a PicoGL framebuffer or null to draw to the default framebuffer (optional)
  depth: true, // a boolean to turn depth testing off/on (optional)
  rasterize: true, // a boolean to turn rasterization off/on (optional)
  cullbackfaces: true, // a boolean to turn backface-culling off/on (optional)
  blend: { // an object of blend params or `false` (optional)
    csrc: GL.SRC_ALPHA,
    cdest: GL.ONE_MINUS_SRC_ALPHA,
    asrc: GL.ONE,
    adest: GL.ONE
  }
}
```

Returns a `render()` function which may be called with any or all of the render `options` above (except `vs` and `fs`),
overriding the original values just for that render.

Example:
```js
const render = dlite({
  vs: vertexShaderSource,
  fs: fragmentShaderSource,
  vertexArray: vertexArray,
  count: 3,
  primitive: dlite.PicoGL.POINTS,
  blend: {
    csrc: dlite.PicoGL.SRC_ALPHA,
    cdest: dlite.PicoGL.ONE_MINUS_SRC_ALPHA,
    asrc: dlite.PicoGL.ONE,
    adest: dlite.PicoGL.ONE
  }
})

render({
  uniforms: {
    uTime: Date.now()
  }
})
```

#### `dlite.clear(r, g, b, a)`

Takes 0 -> 1 values for red, green, blue, and alpha, clearing the default framebuffer with the passed in color.

Example:
```js
dlite.clear(1, 1, 1, 1)
```


### Shader functions

These functions are available within the vertex shader and can be used to project lon/lats to screen space, and to scale
`meters` to "world" space.

#### `vec4 project_position_to_clipspace(vec3 position[, vec3 offset])`

Used to project lon/lat (and height in meters) to screenspace with an optional "world space" `offset`. For meter offsets,
you'll want to first scale `offset` using `project_size`.

#### `float project_size(float meters)`

Converts `meters` to "world space", which is usually used to scale an offset which is then passed to
`project_position_to_clipspace`.

Example:
```glsl
vec3 position = vec3(longitude, latitude, heightInMeters);
vec3 offset = vec3(-1, 1, 0) * project_size(meters);
gl_Position = project_position_to_clipspace(position, offset);
```

------------

### To do
 - [ ] consider using deck's map controller instead of mapbox because mapbox has such a lag it causes the two canvas to go out of sync
 - [ ] figure out where `altitude` comes from in web-mercator-projection stuff (from Tarek: it's always 1.5x the screenheight?)
 - [ ] make camera uniforms a uniform block?
 - [ ] try rendering to framebuffer
 - [ ] make mapbox optional (show no map)
 - [ ] return project/unproject fns
 - [ ] create/manage vertexArrayObject/attributes for user?
 - [ ] experiment with exporting layers
 - [ ] create defaults to run on every call to make sure draw call state doesn't bleed into each other
 - [X] create default fragment shader for transform feedback
 - [x] support transform feedback
 - [x] show example API in README
 - [x] ship a smaller dataset with the demo
 - [x] incorporate animation in demo
 - [x] implement vertexArray updates on render()
 - [x] implement framebuffer support
 - [x] support instancing
 - [x] support gl parameters updates (blend modes)
