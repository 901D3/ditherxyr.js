
// [1]: https://web.archive.org/web/20250818184906/http://caca.zoy.org/study/

var DITHERXYR = {
  // enums
  DIFFUSETRANSF_FLIPX: null,
  DIFFUSETRANSF_FLIPY: null,
  DIFFUSETRANSF_90CW: null,
  DIFFUSETRANSF_180: null,
  DIFFUSETRANSF_270CW: null,

  // structs
  Struct_Matrix() {
    return {
      matrix: null,
      division: null,

      width: null,
      height: null,
    };
  },

  Struct_CompiledMatrix() {
    return {
      matrix: null,

      width: null,
      height: null,
    };
  },

  Struct_ClassMap() {
    return {
      map: null,

      width: null,
      height: null,
    };
  },

  Struct_CompiledClassMap() {
    return {
      classMap: null,
      compiledClassMap: null,
      kernelTransform: null,
      classCount: null,

      width: null,
      height: null,
    };
  },

  Struct_DiffuseKernel() {
    return {
      weights: [],
      division: null,

      center: new Int32Array(2),
      dimension: new Int32Array(2),
    };
  },

  Struct_CompiledDiffuseKernels() {
    return {
      weights: null,
      weightCount: null,

      offsets: null,
    };
  },

  offsetIn: 0,
  strideIn: 1,

  offsetOut: 0,
  strideOut: 1,

  ProcessOrderedDitherMatrix() { },
  CompileDiffuseKernel() { },
  CompileClassMatrix() { },

  SetvalueLimits() { },

  // [2]: https://en.wikipedia.org/wiki/Ordered_dithering
  DitherOrdered() { },

  // [3]: https://pippin.gimp.org/a_dither
  DitherArithmetic() { },

  // [4]: https://en.wikipedia.org/wiki/Error_diffusion
  // [5]: https://perso.liris.cnrs.fr/ostrom/publications/pdf/SIGGRAPH01_varcoeffED.pdf
  // [6]: https://dl.acm.org/doi/10.1145/35039.35040
  CreateDitherErrorDiffusion() { },
};

DITHERXYR.DIFFUSETRANSF_FLIPX = 1 << 0;
DITHERXYR.DIFFUSETRANSF_FLIPY = 1 << 1;
DITHERXYR.DIFFUSETRANSF_90CW = 1 << 2;
DITHERXYR.DIFFUSETRANSF_180 = DITHERXYR.DIFFUSETRANSF_FLIPX | DITHERXYR.DIFFUSETRANSF_FLIPY;
DITHERXYR.DIFFUSETRANSF_270CW = DITHERXYR.DIFFUSETRANSF_FLIPX | DITHERXYR.DIFFUSETRANSF_FLIPY | DITHERXYR.DIFFUSETRANSF_90CW;

DITHERXYR.ProcessOrderedDitherMatrix = function (matrix, compiledMatrix) {
  const size = matrix.width * matrix.height;

  const invMax = 1 / matrix.division;
  for (let i = 0; i < size; i++) compiledMatrix.matrix[i] = matrix.matrix[i] * invMax;

  compiledMatrix.width = matrix.width;
  compiledMatrix.height = matrix.height;
};

DITHERXYR.CompileClassMatrix = function (classMap, compiledClassMap) {
  compiledClassMap.width = classMap.width;
  compiledClassMap.height = classMap.height;

  for (let y = 0; y < classMap.height; y++) {
    const row = y * classMap.width;

    for (let x = 0; x < classMap.width; x++) {
      const idx = row + x;
      const clIdx = classMap.map[idx] * 2;

      compiledClassMap.compiledClassMap[clIdx] = x;
      compiledClassMap.compiledClassMap[clIdx + 1] = y;

      compiledClassMap.classMap[idx] = classMap.map[idx];
    }
  }

  compiledClassMap.classCount = classMap.width * classMap.height;
};

DITHERXYR.CompileDiffuseKernel = function (diffuseKernelList, kernelCount, compiledDiffuseKernelList) {
  for (let i = 0; i < kernelCount; i++) {
    const currentIn = diffuseKernelList[i];
    const currentOut = compiledDiffuseKernelList[i];

    const center = currentIn.center;
    const width = currentIn.dimension[0];
    const height = currentIn.dimension[1];

    let j = 0;

    for (let y = 0; y < height; y++) {
      const row = y * width;

      for (let x = 0; x < width; x++) {
        const idx = row + x;

        const v = currentIn.weights[idx];
        if (v <= 0) continue;

        currentOut.weights[j] = v / currentIn.division;
        currentOut.offsets[j * 2] = x - center[0];
        currentOut.offsets[j * 2 + 1] = y - center[1];
        j++;
      }
    }
  }
};

DITHERXYR.DitherOrdered = function (buffer, out, width, height, compiledMatrix, normalizeValue, rescaleValue) {
  for (let y = 0, matrixY = 0; y < height; y++, matrixY++) {
    if (matrixY === compiledMatrix.height) matrixY = 0;

    const row = y * width;
    const matrixRow = matrixY * compiledMatrix.width;

    for (let x = 0, matrixX = 0; x < width; x++, matrixX++) {
      const idx = row + x;
      const idxIn = idx * DITHERXYR.strideIn + DITHERXYR.offsetIn;
      const idxOut = idx * DITHERXYR.strideOut + DITHERXYR.offsetOut;

      if (matrixX === compiledMatrix.width) matrixX = 0;

      out[idxOut] = Math.floor(buffer[idxIn] * normalizeValue + compiledMatrix.matrix[matrixRow + matrixX]) * rescaleValue;
    }
  }
};

DITHERXYR.DitherArithmetic = function (buffer, out, width, height, arithFn, normalizeValue, rescaleValue) {
  for (let y = 0; y < height; y++) {
    const row = y * width;

    for (let x = 0; x < width; x++) {
      const idx = row + x;
      const idxIn = idx * DITHERXYR.strideIn + DITHERXYR.offsetIn;
      const idxOut = idx * DITHERXYR.strideOut + DITHERXYR.offsetOut;

      const v = buffer[idxIn];

      out[idxOut] = Math.floor(v * normalizeValue + arithFn(x, y, v)) * rescaleValue;
    }
  }
};

DITHERXYR.CreateDitherErrorDiffusion = function (DIRECT_ERROR_PROGPAGATION, ALLOW_DIFFUSE_ERROR_TO_SCANNED) {
  return function (
    buffer, out, errorBuffer, width, height,
    compiledDiffuseKernelList,
    compiledClassMap,
    tileCountX, tileCountY,
    normalizeValue, rescaleValue, paletteValueCount) {

    let targetBuffer;
    if (!DIRECT_ERROR_PROGPAGATION) targetBuffer = errorBuffer;
    else targetBuffer = out;

    for (let tileY = 0; tileY < tileCountY; tileY++) {
      const tileOriginY = tileY * compiledClassMap.height;

      for (let tileX = 0; tileX < tileCountX; tileX++) {
        const tileOriginX = tileX * compiledClassMap.width;

        for (let cl = 0; cl < compiledClassMap.classCount; cl++) {
          const cl2 = cl * 2;

          const x = tileOriginX + compiledClassMap.compiledClassMap[cl2];
          const y = tileOriginY + compiledClassMap.compiledClassMap[cl2 + 1];

          if (x >= width || y >= height) continue;

          const idx = y * width + x;
          const idxIn = idx * DITHERXYR.strideIn + DITHERXYR.offsetIn;
          const idxOut = idx * DITHERXYR.strideOut + DITHERXYR.offsetOut;

          const pixel = buffer[idxIn];
          let pixelWError = pixel;
          if (!DIRECT_ERROR_PROGPAGATION) pixelWError += errorBuffer[idx];

          const result = Math.round(pixelWError * normalizeValue) * rescaleValue;
          let error = pixelWError - result;

          out[idxOut] = result;

          let totalWeight = 0;

          let cacheCount = 0;

          let kernelIdx = Math.floor(pixel);
          if (kernelIdx < 0) kernelIdx = 0;
          else if (kernelIdx >= paletteValueCount) kernelIdx = paletteValueCount - 1;

          const currentKernel = compiledDiffuseKernelList[kernelIdx];

          const transf = compiledClassMap.kernelTransform[idx];

          const rotate90cw = !!(transf & DITHERXYR.DIFFUSETRANSF_90CW);
          const flipX = !!(transf & DITHERXYR.DIFFUSETRANSF_FLIPX);
          const flipY = !!(transf & DITHERXYR.DIFFUSETRANSF_FLIPY);

          let cacheIndices, cacheWeights;
          if (!ALLOW_DIFFUSE_ERROR_TO_SCANNED) {
            cacheIndices = new Int32Array(currentKernel.weightCount);
            cacheWeights = new Float32Array(currentKernel.weightCount);
          }

          for (let k = 0; k < currentKernel.weightCount; k++) {
            const k2 = k * 2;
            let kx = currentKernel.offsets[k2];
            let ky = currentKernel.offsets[k2 + 1];

            if (rotate90cw) kx = ky, ky = -kx;
            if (flipX) kx = -kx;
            if (flipY) ky = -ky;

            const newx = x + kx;
            const newy = y + ky;

            if (ALLOW_DIFFUSE_ERROR_TO_SCANNED) {
              if (newx < 0 || newy < 0 || newx >= width || newy >= height)
                continue;
            }
            else {
              let mapx = newx % compiledClassMap.width;
              let mapy = newy % compiledClassMap.height;

              if (mapx < 0) mapx += compiledClassMap.width;
              if (mapy < 0) mapy += compiledClassMap.height;

              if (cl > compiledClassMap.classMap[mapy * compiledClassMap.width + mapx])
                continue;
            }

            let newIdx = newy * width + newx;
            if (DIRECT_ERROR_PROGPAGATION)
              newIdx = newIdx * DITHERXYR.strideOut + DITHERXYR.offsetOut;

            const weight = currentKernel.weights[k];

            if (ALLOW_DIFFUSE_ERROR_TO_SCANNED) {
              targetBuffer[newIdx] += error * weight;
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
                targetBuffer[cacheIndices[k]] += cacheWeights[k] * error;
            }
          }
        }
      }
    }
  }
};
