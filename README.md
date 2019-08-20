# dlite
deck.gl, but lighter

```bash
$ npm i && npm start
```

### To do
 - [ ] consider using deck's map controller instead of mapbox because mapbox has such a lag it causes the two canvas to go out of sync
 - [ ] figure out where `altitude` comes from in web-mercator-projection stuff
 - [ ] make camera uniforms a uniform block?
 - [ ] support transform feedback
 - [ ] try rendering to framebuffer
 - [ ] show example API in README
 - [ ] make mapbox optional (show no map)
 - [ ] return project/unproject fns
 - [ ] create/manage vertexArrayObject/attributes for user?
 - [ ] experiment with exporting layers
 - [x] ship a smaller dataset with the demo
 - [x] incorporate animation in demo
 - [x] implement vertexArray updates on render()
 - [x] implement framebuffer support
 - [x] support instancing
 - [x] support gl parameters updates (blend modes)
