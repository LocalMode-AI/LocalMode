/**
 * Landmark Topology Constants
 *
 * Connection pairs and category constants for rendering hand, pose, and face
 * landmark overlays. Connection pairs are `[fromIndex, toIndex]` tuples
 * referencing landmark array indices.
 *
 * @packageDocumentation
 */

/**
 * Hand landmark connection pairs (MediaPipe 21-point hand topology).
 *
 * Connects wrist, palm, and the five fingers (thumb, index, middle, ring,
 * pinky) for drawing a hand skeleton overlay.
 */
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  // Thumb
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  // Index finger
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  // Middle finger
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  // Ring finger
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  // Pinky
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  // Palm
  [0, 17],
];

/**
 * Pose landmark connection pairs (MediaPipe 33-point pose topology).
 *
 * Connects face anchor points, torso, arms, and legs for drawing a full
 * body skeleton overlay.
 */
export const POSE_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  // Face
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 7],
  [0, 4],
  [4, 5],
  [5, 6],
  [6, 8],
  [9, 10],
  // Torso
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24],
  // Left arm
  [11, 13],
  [13, 15],
  [15, 17],
  [15, 19],
  [15, 21],
  [17, 19],
  // Right arm
  [12, 14],
  [14, 16],
  [16, 18],
  [16, 20],
  [16, 22],
  [18, 20],
  // Left leg
  [23, 25],
  [25, 27],
  [27, 29],
  [27, 31],
  [29, 31],
  // Right leg
  [24, 26],
  [26, 28],
  [28, 30],
  [28, 32],
  [30, 32],
];

/**
 * Face landmark connection pairs (MediaPipe face mesh contours).
 *
 * Covers the face oval, both eyes, both eyebrows, lips, and the nose
 * midline — a recognizable face wireframe over the 478-point mesh. For the
 * full dense tessellation, use the provider's tessellation export.
 */
export const FACE_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  // Face oval (forehead, cheeks, jaw)
  [10, 338],
  [338, 297],
  [297, 332],
  [332, 284],
  [284, 251],
  [251, 389],
  [389, 356],
  [356, 454],
  [454, 323],
  [323, 361],
  [361, 288],
  [288, 397],
  [397, 365],
  [365, 379],
  [379, 378],
  [378, 400],
  [400, 377],
  [377, 152],
  [152, 148],
  [148, 176],
  [176, 149],
  [149, 150],
  [150, 136],
  [136, 172],
  [172, 58],
  [58, 132],
  [132, 93],
  [93, 234],
  [234, 127],
  [127, 162],
  [162, 21],
  [21, 54],
  [54, 103],
  [103, 67],
  [67, 109],
  [109, 10],
  // Left eye
  [263, 249],
  [249, 390],
  [390, 373],
  [373, 374],
  [374, 380],
  [380, 381],
  [381, 382],
  [382, 362],
  [263, 466],
  [466, 388],
  [388, 387],
  [387, 386],
  [386, 385],
  [385, 384],
  [384, 398],
  [398, 362],
  // Left eyebrow
  [276, 283],
  [283, 282],
  [282, 295],
  [295, 285],
  [300, 293],
  [293, 334],
  [334, 296],
  [296, 336],
  // Right eye
  [33, 7],
  [7, 163],
  [163, 144],
  [144, 145],
  [145, 153],
  [153, 154],
  [154, 155],
  [155, 133],
  [33, 246],
  [246, 161],
  [161, 160],
  [160, 159],
  [159, 158],
  [158, 157],
  [157, 173],
  [173, 133],
  // Right eyebrow
  [46, 53],
  [53, 52],
  [52, 65],
  [65, 55],
  [70, 63],
  [63, 105],
  [105, 66],
  [66, 107],
  // Lips (outer)
  [61, 146],
  [146, 91],
  [91, 181],
  [181, 84],
  [84, 17],
  [17, 314],
  [314, 405],
  [405, 321],
  [321, 375],
  [375, 291],
  [61, 185],
  [185, 40],
  [40, 39],
  [39, 37],
  [37, 0],
  [0, 267],
  [267, 269],
  [269, 270],
  [270, 409],
  [409, 291],
  // Lips (inner)
  [78, 95],
  [95, 88],
  [88, 178],
  [178, 87],
  [87, 14],
  [14, 317],
  [317, 402],
  [402, 318],
  [318, 324],
  [324, 308],
  [78, 191],
  [191, 80],
  [80, 81],
  [81, 82],
  [82, 13],
  [13, 312],
  [312, 311],
  [311, 310],
  [310, 415],
  [415, 308],
  // Nose midline
  [168, 6],
  [6, 197],
  [197, 195],
  [195, 5],
  [5, 4],
  [4, 1],
  [1, 19],
  [19, 94],
  [94, 2],
];

/**
 * Standard MediaPipe hand gesture category names.
 *
 * Returned by gesture recognition models in the `gesture` field of each
 * {@link import('./types.js').GestureResultItem}.
 */
export const GESTURE_CATEGORIES = [
  'None',
  'Closed_Fist',
  'Open_Palm',
  'Pointing_Up',
  'Thumb_Down',
  'Thumb_Up',
  'Victory',
  'ILoveYou',
] as const;

/**
 * A standard MediaPipe gesture category name.
 */
export type GestureCategory = (typeof GESTURE_CATEGORIES)[number];
