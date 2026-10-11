/*
ditherxyr.js
https://github.com/901D3/ditherxyr.js

v2026-oct-11
*/


// [1]: https://web.archive.org/web/20250818184906/http://caca.zoy.org/study/

var DITHERXYR = {
  // enums
  KERNEL_TRANSFORM_FLIPX: null,
  KERNEL_TRANSFORM_FLIPY: null,
  KERNEL_TRANSFORM_90CW: null,
  KERNEL_TRANSFORM_180: null,
  KERNEL_TRANSFORM_270CW: null,

  // structs
  Struct_Palette() {
    return {
      v: null, // aplette values
      count: null,
      max: null, // max palette value
      // generated when processing palette
      // allocate with size of max+1
      lookupcache: null,
    };
  },

  Struct_Matrix() {
    return {
      matrix: null, // must be normalized
      width: null,
      height: null,
    };
  },

  Struct_ClassMap() {
    return {
      map: null,
      // alocate with size of width*height*2
      processed_map: null,
      kernel_transform: null,
      class_count: null,

      width: null,
      height: null,
    };
  },

  Struct_DiffuseKernel() {
    return {
      // [weight, x, y], weight must be normalized
      // allocate with size of weight_count*3
      weights: null,
      weight_count: null,

      width: null,
      height: null,
    };
  },

  input_offset: 0,
  input_stride: 1,

  output_offset: 0,
  output_stride: 1,

  QuantizeFn(value, lower, upper, threshold) { },

  ProcessPalette(palette) { },

  ProcessClassMap() { },

  SetValueLimits() { },

  // [2]: https://en.wikipedia.org/wiki/Ordered_dithering
  DitherOrdered() { },

  // [3]: https://pippin.gimp.org/a_dither
  ArithmeticFn(x, y, v) { },
  DitherArithmetic() { },

  // [4]: https://en.wikipedia.org/wiki/Error_diffusion
  // [5]: https://perso.liris.cnrs.fr/ostrom/publications/pdf/SIGGRAPH01_varcoeffED.pdf
  // [6]: https://dl.acm.org/doi/10.1145/35039.35040
  CreateDitherErrorDiffusion() { },
};

DITHERXYR.KERNEL_TRANSFORM_FLIPX = 1 << 0;
DITHERXYR.KERNEL_TRANSFORM_FLIPY = 1 << 1;
DITHERXYR.KERNEL_TRANSFORM_90CW = 1 << 2;
DITHERXYR.KERNEL_TRANSFORM_180 = DITHERXYR.KERNEL_TRANSFORM_FLIPX | DITHERXYR.KERNEL_TRANSFORM_FLIPY;
DITHERXYR.KERNEL_TRANSFORM_270CW = DITHERXYR.KERNEL_TRANSFORM_FLIPX | DITHERXYR.KERNEL_TRANSFORM_FLIPY | DITHERXYR.KERNEL_TRANSFORM_90CW;

// default inplementation
DITHERXYR.QuantizeFn = function (value, lower, upper, threshold) {
  const t = (value - lower) / (upper - lower);
  return (t < threshold) ? lower : upper;
};

// default inplementation
DITHERXYR.ArithmeticFn = function (x, y, v) { return Math.random(); };

DITHERXYR.ProcessPalette = function (palette) {
  const lastInterval = palette.count - 2;

  for (let i = 0, j = 0; i <= palette.max; i++) {
    while (j < lastInterval && i >= palette.v[j + 1])
      j++;

    palette.lookupcache[i] = j;
  }
};

DITHERXYR.ProcessClassMap = function (classMap) {
  for (let y = 0; y < classMap.height; y++) {
    const row = y * classMap.width;

    for (let x = 0; x < classMap.width; x++) {
      const idx = row + x;
      const classidx = classMap.map[idx] * 2;

      classMap.processed_map[classidx] = x;
      classMap.processed_map[classidx + 1] = y;
    }
  }

  classMap.class_count = classMap.width * classMap.height;
};

DITHERXYR.DitherOrdered = function (buffer, out, width, height, matrix, palette) {
  for (let y = 0, maty = 0; y < height; y++, maty++) {
    if (maty === matrix.height) maty = 0;// wrap around 
    const matrow = maty * matrix.width;

    const row = y * width;

    for (let x = 0, matx = 0; x < width; x++, matx++) {
      if (matx === matrix.width) matx = 0;// wrap around 

      const idx = row + x;
      const idxIn = idx * DITHERXYR.input_stride + DITHERXYR.input_offset;
      const idxOut = idx * DITHERXYR.output_stride + DITHERXYR.output_offset;

      const value = buffer[idxIn];

      const intervalIdx = palette.lookupcache[value];

      out[idxOut] = DITHERXYR.QuantizeFn(
        value,
        palette.v[intervalIdx],
        palette.v[intervalIdx + 1],
        matrix.matrix[matrow + matx]);
    }
  }
};

DITHERXYR.DitherArithmetic = function (buffer, out, width, height, palette) {
  for (let y = 0; y < height; y++) {
    const row = y * width;

    for (let x = 0; x < width; x++) {
      const idx = row + x;
      const idxIn = idx * DITHERXYR.input_stride + DITHERXYR.input_offset;
      const idxOut = idx * DITHERXYR.output_stride + DITHERXYR.output_offset;

      const value = buffer[idxIn];

      const intervalIdx = palette.lookupcache[value];

      out[idxOut] = DITHERXYR.QuantizeFn(
        value,
        palette.v[intervalIdx],
        palette.v[intervalIdx + 1],
        DITHERXYR.ArithmeticFn(x, y, value));
    }
  }
};

DITHERXYR.CreateDitherErrorDiffusion = function (DIRECT_ERROR_PROGPAGATION, ALLOW_DIFFUSE_ERROR_TO_SCANNED) {
  return function (
    buffer, out, errorBuffer, width, height,
    kernelList,
    classMap,
    tileCountX, tileCountY,
    palette) {

    let p_target;
    if (!DIRECT_ERROR_PROGPAGATION) p_target = errorBuffer;
    else p_target = out;

    for (let ty = 0; ty < tileCountY; ty++) {
      const tileorigy = ty * classMap.height;

      for (let tx = 0; tx < tileCountX; tx++) {
        const tileorigx = tx * classMap.width;

        for (let cl = 0; cl < classMap.class_count; cl++) {
          const x = tileorigx + classMap.processed_map[cl * 2];
          const y = tileorigy + classMap.processed_map[cl * 2 + 1];

          if (x >= width || y >= height) continue;

          const idx = y * width + x;
          const idxIn = idx * DITHERXYR.input_stride + DITHERXYR.input_offset;
          const idxOut = idx * DITHERXYR.output_stride + DITHERXYR.output_offset;

          const value = buffer[idxIn];
          let valueWError = value;
          if (!DIRECT_ERROR_PROGPAGATION) valueWError += errorBuffer[idx];

          const intervalIdx = palette.lookupcache[value];

          const result = DITHERXYR.QuantizeFn(
            valueWError,
            palette.v[intervalIdx],
            palette.v[intervalIdx + 1],
            0.5);

          let error = valueWError - result;

          out[idxOut] = result;

          let totalWeight = 0;

          let cacheCount = 0;

          let kernelIdx = Math.floor(value);
          if (kernelIdx < 0) kernelIdx = 0;
          else if (kernelIdx >= palette.max) kernelIdx = palette.max - 1;

          const p_currkernel = kernelList[kernelIdx];

          const transf = classMap.kernel_transform[idx];

          const rotate90cw = !!(transf & DITHERXYR.KERNEL_TRANSFORM_90CW);
          const flipX = !!(transf & DITHERXYR.KERNEL_TRANSFORM_FLIPX);
          const flipY = !!(transf & DITHERXYR.KERNEL_TRANSFORM_FLIPY);

          let cacheIndices, cacheWeights;
          if (!ALLOW_DIFFUSE_ERROR_TO_SCANNED) {
            cacheIndices = new Int32Array(p_currkernel.weightCount);
            cacheWeights = new Float32Array(p_currkernel.weightCount);
          }

          for (let k = 0; k < p_currkernel.weight_count; k++) {
            let kx = p_currkernel.weights[k * 3 + 1];
            let ky = p_currkernel.weights[k * 3 + 2];

            if (rotate90cw) { const t = kx; kx = ky; ky = -t; }
            if (flipX) kx = -kx;
            if (flipY) ky = -ky;

            const newx = x + kx;
            const newy = y + ky;

            if (ALLOW_DIFFUSE_ERROR_TO_SCANNED) {
              if (newx < 0 || newy < 0 || newx >= width || newy >= height)
                continue;
            }
            else {
              let mapx = newx % classMap.width;
              let mapy = newy % classMap.height;

              if (mapx < 0) mapx += classMap.width;
              if (mapy < 0) mapy += classMap.height;

              if (cl > classMap.map[mapy * classMap.width + mapx])
                continue;
            }

            let newIdx = newy * width + newx;
            if (DIRECT_ERROR_PROGPAGATION)
              newIdx = newIdx * DITHERXYR.output_stride + DITHERXYR.output_offset;

            const weight = p_currkernel.weights[k * 3];

            if (ALLOW_DIFFUSE_ERROR_TO_SCANNED) {
              p_target[newIdx] += error * weight;
              continue;
            }
            else {
              totalWeight += weight;

              if (newx < 0 || newy < 0 || newx >= width || newy >= height)
                continue;

              cacheIndices[cacheCount] = newIdx;
              cacheWeights[cacheCount] = weight;
              cacheCount++;
            }
          }

          if (!ALLOW_DIFFUSE_ERROR_TO_SCANNED) {
            if (totalWeight !== 0) {
              error /= totalWeight;

              for (let k = 0; k < cacheCount; k++)
                p_target[cacheIndices[k]] += cacheWeights[k] * error;
            }
          }
        }
      }
    }
  }
};
