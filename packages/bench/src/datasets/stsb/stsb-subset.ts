/**
 * STS Benchmark subset — the first 100 pairs of the STS-B test split
 * (semantic textual similarity; human scores 0-5). Source:
 * https://huggingface.co/datasets/mteb/stsbenchmark-sts (test split).
 *
 * LICENSE: CC BY-SA 4.0 (share-alike). This file and any redistribution of the
 * pairs below remain under CC BY-SA 4.0 — see LICENSE-CC-BY-SA.md in this
 * directory. Kept isolated from the MIT-licensed code and datasets on purpose.
 *
 * Used by the embedding quality lane: Spearman correlation of cosine
 * similarities against the human scores.
 */

/** One sentence pair with its human similarity score (0-5). */
export interface STSPair {
  s1: string;
  s2: string;
  score: number;
}

/** 100-pair STS-B test subset (order preserved from the source dataset). */
export const STSB_SUBSET: readonly STSPair[] = [
  {
    "s1": "A girl is styling her hair.",
    "s2": "A girl is brushing her hair.",
    "score": 2.5
  },
  {
    "s1": "A group of men play soccer on the beach.",
    "s2": "A group of boys are playing soccer on the beach.",
    "score": 3.6
  },
  {
    "s1": "One woman is measuring another woman's ankle.",
    "s2": "A woman measures another woman's ankle.",
    "score": 5.0
  },
  {
    "s1": "A man is cutting up a cucumber.",
    "s2": "A man is slicing a cucumber.",
    "score": 4.2
  },
  {
    "s1": "A man is playing a harp.",
    "s2": "A man is playing a keyboard.",
    "score": 1.5
  },
  {
    "s1": "A woman is cutting onions.",
    "s2": "A woman is cutting tofu.",
    "score": 1.8
  },
  {
    "s1": "A man is riding an electric bicycle.",
    "s2": "A man is riding a bicycle.",
    "score": 3.5
  },
  {
    "s1": "A man is playing the drums.",
    "s2": "A man is playing the guitar.",
    "score": 2.2
  },
  {
    "s1": "A man is playing guitar.",
    "s2": "A lady is playing the guitar.",
    "score": 2.2
  },
  {
    "s1": "A man is playing a guitar.",
    "s2": "A man is playing a trumpet.",
    "score": 1.714
  },
  {
    "s1": "A man is playing a guitar.",
    "s2": "A man is playing a trumpet.",
    "score": 1.714
  },
  {
    "s1": "A man is cutting an onion.",
    "s2": "A man cuts an onion.",
    "score": 5.0
  },
  {
    "s1": "A man is cycling.",
    "s2": "A man is talking.",
    "score": 0.6
  },
  {
    "s1": "A man is slicing open a fish.",
    "s2": "A man is cutting up a fish.",
    "score": 4.4
  },
  {
    "s1": "A man is slicing a tomato.",
    "s2": "A man is slicing a bun.",
    "score": 2.0
  },
  {
    "s1": "A man is playing a guitar.",
    "s2": "A man is playing a keyboard.",
    "score": 1.8
  },
  {
    "s1": "A baby panda goes down a slide.",
    "s2": "A panda slides down a slide.",
    "score": 4.4
  },
  {
    "s1": "A man is singing and playing a guitar.",
    "s2": "A man is playing a guitar.",
    "score": 3.6
  },
  {
    "s1": "A man attacks a woman.",
    "s2": "A man slaps a woman.",
    "score": 3.6
  },
  {
    "s1": "A man is driving a car.",
    "s2": "A man is riding a horse.",
    "score": 1.2
  },
  {
    "s1": "A woman is cutting tofu.",
    "s2": "A woman is cutting an onion.",
    "score": 2.4
  },
  {
    "s1": "The woman is styling her hair.",
    "s2": "The woman is slicing herbs.",
    "score": 0.2
  },
  {
    "s1": "Two zebras play in an open field.",
    "s2": "Two zebras are playing in a field.",
    "score": 4.2
  },
  {
    "s1": "A man is cutting a potato.",
    "s2": "A man is slicing some potato.",
    "score": 4.4
  },
  {
    "s1": "A man is slicing an onion.",
    "s2": "A woman is slicing a pumpkin.",
    "score": 2.25
  },
  {
    "s1": "A  man is dancing.",
    "s2": "A man and woman is dancing.",
    "score": 2.0
  },
  {
    "s1": "A man is riding a motorcycle.",
    "s2": "A woman is riding a horse.",
    "score": 0.75
  },
  {
    "s1": "A woman is slicing garlics.",
    "s2": "A woman is slicing an onion.",
    "score": 2.2
  },
  {
    "s1": "A man is speaking.",
    "s2": "A man is cooking.",
    "score": 0.8
  },
  {
    "s1": "A little boy is singing and playing a guitar.",
    "s2": "A man is singing and playing the guitar.",
    "score": 2.2
  },
  {
    "s1": "A turtle is swimming in water.",
    "s2": "A turtle is walking underwater.",
    "score": 3.2
  },
  {
    "s1": "A young woman is putting stickers all over her face.",
    "s2": "A woman is applying stickers to her face.",
    "score": 4.8
  },
  {
    "s1": "A woman is wrapping tofu.",
    "s2": "A woman is balling dough.",
    "score": 1.4
  },
  {
    "s1": "A cat is eating some corn.",
    "s2": "A cat is eating corn on the cob.",
    "score": 4.25
  },
  {
    "s1": "A man is eating a food.",
    "s2": "A man is eating a piece of bread.",
    "score": 3.4
  },
  {
    "s1": "A man is playing a guitar.",
    "s2": "A man is eating pasta.",
    "score": 0.533
  },
  {
    "s1": "A man is kicking pots of water.",
    "s2": "A man is picking flowers.",
    "score": 0.4
  },
  {
    "s1": "A man is cutting a pipe with scissors.",
    "s2": "A man is cutting carpet with a knife.",
    "score": 1.2
  },
  {
    "s1": "A woman is dancing in the rain.",
    "s2": "A woman dances in the rain out side.",
    "score": 5.0
  },
  {
    "s1": "A woman is taking a bath.",
    "s2": "A woman is riding a horse.",
    "score": 0.538
  },
  {
    "s1": "A man mixes vegetables in a pot.",
    "s2": "A person is stirring vegetables in a pot.",
    "score": 3.75
  },
  {
    "s1": "A woman is talking on a cell phone.",
    "s2": "A man and woman are talking on the phone.",
    "score": 3.0
  },
  {
    "s1": "A man is playing a guitar.",
    "s2": "A man is singing while playing the guitar.",
    "score": 3.6
  },
  {
    "s1": "A man is playing a guitar.",
    "s2": "A man is driving a car.",
    "score": 0.5
  },
  {
    "s1": "A man is cutting apple by his hand.",
    "s2": "A man is cutting carpet with a knife.",
    "score": 1.5
  },
  {
    "s1": "A man is opening a door.",
    "s2": "A man is cutting an onion.",
    "score": 0.8
  },
  {
    "s1": "A man is slicing a tomato.",
    "s2": "A man is riding a horse.",
    "score": 0.8
  },
  {
    "s1": "A man is cutting paper with a sword.",
    "s2": "A woman is cutting a tomato.",
    "score": 0.6
  },
  {
    "s1": "A boy studies a calendar.",
    "s2": "A boy is looking at a calendar.",
    "score": 4.4
  },
  {
    "s1": "The ballerina is dancing.",
    "s2": "A man is dancing.",
    "score": 1.75
  },
  {
    "s1": "A woman is dancing.",
    "s2": "A woman is playing violin.",
    "score": 0.4
  },
  {
    "s1": "A woman is slicing some tomatoes.",
    "s2": "A woman is chopping a potato.",
    "score": 1.4
  },
  {
    "s1": "A woman is water skiing.",
    "s2": "A woman is slicing fish.",
    "score": 0.4
  },
  {
    "s1": "A man is playing a flute.",
    "s2": "A man is riding a scooter.",
    "score": 0.8
  },
  {
    "s1": "A man is playing the piano.",
    "s2": "A man played the guitar.",
    "score": 2.0
  },
  {
    "s1": "A woman is picking a can.",
    "s2": "A man is playing a guitar.",
    "score": 0.133
  },
  {
    "s1": "A man puts three pieces of meat into a pan.",
    "s2": "A man is putting meat in a pan.",
    "score": 4.0
  },
  {
    "s1": "A woman is cutting an onion.",
    "s2": "A woman is cleaning a garden.",
    "score": 0.267
  },
  {
    "s1": "Some men are sawing.",
    "s2": "Men are sawing logs.",
    "score": 3.4
  },
  {
    "s1": "A car is driven down the road.",
    "s2": "A girl is walking down a road.",
    "score": 1.2
  },
  {
    "s1": "The man is kissing and hugging the woman.",
    "s2": "A man is hugging and kissing a woman.",
    "score": 5.0
  },
  {
    "s1": "A train is moving.",
    "s2": "A man is doing yoga.",
    "score": 0.0
  },
  {
    "s1": "Someone is slicing an onion.",
    "s2": "A woman is cutting onion.",
    "score": 3.8
  },
  {
    "s1": "A woman is playing in the ocean.",
    "s2": "A woman is preparing shrimp to cook.",
    "score": 0.75
  },
  {
    "s1": "A person is playing an electronic keyboard.",
    "s2": "A kid is playing keyboard.",
    "score": 3.4
  },
  {
    "s1": "A man is holding a leaf.",
    "s2": "A monkey is fighting a man.",
    "score": 0.0
  },
  {
    "s1": "A woman is peeling shrimp.",
    "s2": "A man is squeezing water.",
    "score": 0.2
  },
  {
    "s1": "A man is sitting and smoking.",
    "s2": "A man is smoking a cigarette.",
    "score": 4.0
  },
  {
    "s1": "A man is playing a guitar.",
    "s2": "A woman is riding a horse.",
    "score": 0.5
  },
  {
    "s1": "A man is standing in front of the window and looking outside.",
    "s2": "A man is staring out the window.",
    "score": 3.8
  },
  {
    "s1": "A skunk is looking here and there.",
    "s2": "A skunk looks at the camera.",
    "score": 2.4
  },
  {
    "s1": "A man is playing the guitar and singing.",
    "s2": "A man sings with a guitar.",
    "score": 4.75
  },
  {
    "s1": "A woman opens a window.",
    "s2": "A man is crawling.",
    "score": 0.0
  },
  {
    "s1": "People are dancing outside.",
    "s2": "A group of people are dancing.",
    "score": 3.75
  },
  {
    "s1": "The man is using a camera to hammer a nail.",
    "s2": "Someone is banging a camera lense against a nail.",
    "score": 2.6
  },
  {
    "s1": "A woman is filing her nails.",
    "s2": "A man is peeling a carrot.",
    "score": 0.0
  },
  {
    "s1": "A boy is crawling into a dog house.",
    "s2": "A boy is playing a wooden flute.",
    "score": 0.75
  },
  {
    "s1": "A woman is swimming underwater.",
    "s2": "A man is slicing some carrots.",
    "score": 0.0
  },
  {
    "s1": "A machine is sharpening a pencil.",
    "s2": "The machine shaved the end of the pencil.",
    "score": 3.8
  },
  {
    "s1": "A monkey is playing drums.",
    "s2": "A gorilla plays the drums.",
    "score": 2.8
  },
  {
    "s1": "A man is opening a box and taking out paper.",
    "s2": "A woman is peeling a potato.",
    "score": 0.0
  },
  {
    "s1": "A woman is dancing.",
    "s2": "A woman plays the clarinet.",
    "score": 0.8
  },
  {
    "s1": "A person is drawing on a large touchscreen.",
    "s2": "A man is drawing on a digital dry erase board.",
    "score": 3.0
  },
  {
    "s1": "The men played follow the leader on the grass.",
    "s2": "The rhino grazed on the grass.",
    "score": 1.0
  },
  {
    "s1": "A woman is cracking eggs.",
    "s2": "A man is talking to a woman.",
    "score": 0.0
  },
  {
    "s1": "A woman peels garlic with her hands.",
    "s2": "The woman is slicing herbs.",
    "score": 1.0
  },
  {
    "s1": "The polar bears fought over the kill.",
    "s2": "Polar bears are fighting each other.",
    "score": 3.4
  },
  {
    "s1": "A man is doing trick with play cards.",
    "s2": "A man is performing a card trick.",
    "score": 5.0
  },
  {
    "s1": "The cat is licking a bottle.",
    "s2": "A cat plays with a small bottle.",
    "score": 2.333
  },
  {
    "s1": "A person is slicing an onion.",
    "s2": "A person cuts ginger.",
    "score": 1.4
  },
  {
    "s1": "A person is peeling a potato with a potato peeler.",
    "s2": "A man is cutting tomatoes with a cleaver.",
    "score": 0.75
  },
  {
    "s1": "Two women are dancing and singing in front of a crowd.",
    "s2": "The women are singing and dancing.",
    "score": 3.538
  },
  {
    "s1": "A man is seasoning some carrots.",
    "s2": "A woman is slicing garlic.",
    "score": 0.8
  },
  {
    "s1": "Two men pushed carts through the woods.",
    "s2": "Two men are pushing carts.",
    "score": 3.5
  },
  {
    "s1": "A man is playing a football.",
    "s2": "A man is maneuvering a soccer ball with his feet.",
    "score": 2.0
  },
  {
    "s1": "The lady peeled the potatoe.",
    "s2": "A woman is peeling a potato.",
    "score": 4.75
  },
  {
    "s1": "A woman is slicing some tofu.",
    "s2": "A woman is cutting a block of tofu into small cubes.",
    "score": 4.0
  },
  {
    "s1": "Someone typed on a keyboard.",
    "s2": "Someone is typing.",
    "score": 4.5
  },
  {
    "s1": "Three young men run, jump, and kick off of a Coke machine.",
    "s2": "Three men are jumping off a wall.",
    "score": 1.5
  },
  {
    "s1": "A young Asian girl is applying eyeliner.",
    "s2": "A girl is putting on eye makeup.",
    "score": 2.4
  }
];
