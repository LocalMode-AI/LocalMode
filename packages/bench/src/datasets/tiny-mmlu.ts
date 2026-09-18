/**
 * tinyMMLU — 100 IRT-anchored items from the MMLU benchmark, selected by the
 * tinyBenchmarks project (Maia Polo et al., "tinyBenchmarks: evaluating LLMs
 * with fewer examples", arXiv:2402.14992). Source dataset:
 * https://huggingface.co/datasets/tinyBenchmarks/tinyMMLU (test split, 100 rows).
 * Upstream MMLU (cais/mmlu) and the tinyBenchmarks repository are MIT-licensed.
 *
 * Used by the quality-fidelity lane: scores measure runtime/quantization
 * fidelity of a model build, not model capability (public sets are assumed
 * to be in training data).
 */

/** One multiple-choice item: four choices, `answer` is the 0-based correct index. */
export interface MMLUItem {
  question: string;
  subject: string;
  choices: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
}

/** The 100-item tinyMMLU test split (order preserved from the source dataset). */
export const TINY_MMLU: readonly MMLUItem[] = [
  {
    "question": "The number of days it takes to build a new house has a variance of 386. A sample of 40 new homes shows an average building time of 83 days. With what confidence can we assert that the average building time for a new house is between 80 and 90 days?",
    "subject": "high_school_statistics",
    "choices": [
      "15.4%",
      "17.8%",
      "20.0%",
      "82.1%"
    ],
    "answer": 3
  },
  {
    "question": "According to trials on diabetes prevention, high-risk individuals can reduce their risk to develop diabetes by doing the following:",
    "subject": "nutrition",
    "choices": [
      "Eating a very low carbohydrate diet",
      "Consuming a diet high in monounsaturated fats",
      "Losing 5-7% of body weight through a hypocaloric low fat diet and 30 minutes of daily activity",
      "Initiating metformin 850 mg BID and practicing daily vigorous exercise"
    ],
    "answer": 2
  },
  {
    "question": "Which of the following is true regarding the complications of a large goitre?",
    "subject": "clinical_knowledge",
    "choices": [
      "It causes stridor due to compression of the oesophagus",
      "Dysphagia is an indication for surgery",
      "It causes hoarseness due to compression of the trachea",
      "It causes a more florid thyrotoxicosis than a smaller goitre"
    ],
    "answer": 1
  },
  {
    "question": "Doses of substances used in animal toxicity studies are usually many times greater than those experienced by people because:",
    "subject": "nutrition",
    "choices": [
      "Animals are generally much less sensitive than people",
      "Such tests can detect only very large risks because of the fact that only small numbers of animals can be used",
      "It is difficult in such studies to determine whether the observed toxic effects were caused by the substance",
      "It is the only way to ensure results are applicable to people"
    ],
    "answer": 1
  },
  {
    "question": "Rowena can paint a room in $14$ hours, while Ruby can paint it in $6$ hours. If Rowena paints for $x$ hours and Ruby paints for $y$ hours, they will finish half of the painting, while if Rowena paints for $y$ hours and Ruby paints for $x$ hours they will paint the whole room. Find the ordered pair $(x,y)$.",
    "subject": "high_school_mathematics",
    "choices": [
      "(\\frac{11}{10}, \\frac{11}{10})",
      "(\\frac{231}{20}, \\frac{21}{20})",
      "(\\frac{231}{40}, \\frac{21}{40})",
      "(1,1)"
    ],
    "answer": 2
  },
  {
    "question": "Which of the following statements would Macedo disagree with?",
    "subject": "moral_disputes",
    "choices": [
      "States should give special weight to their own citizens.",
      "Immigration policies can have powerful economic effects.",
      "Self-governance is morally irrelevant to the immigration debate.",
      "There are reasons to think U.S. immigration policy has had detrimental effects on income distribution among citizens."
    ],
    "answer": 2
  },
  {
    "question": "A 17-year-old girl is brought to the physician by her mother because she has not had a menstrual period for 6 months. The patient is unconcerned about the lack of menses. Menarche occurred at the age of 12 years, and menses had occurred at regular 28-day intervals until they became irregular 1 year ago. She is a member of her high school gymnastics team. She appears emaciated. She is 163 cm (5 ft 4 in) tall and weighs 40 kg (88 lb); BMI is 15 kg/m2 . Her pulse is 54/min, and blood pressure is 80/50 mm Hg. Which of the following is the most likely cause of this patient's amenorrhea?",
    "subject": "professional_medicine",
    "choices": [
      "Hyperthyroidism",
      "Hypogonadotropic hypogonadism",
      "Hypothyroidism",
      "Polycystic ovarian syndrome"
    ],
    "answer": 1
  },
  {
    "question": "The Yang-shao culture gave way to the Lung-Shan sometime after:",
    "subject": "prehistory",
    "choices": [
      "6,000 B.P.",
      "5,000 B.P.",
      "4,000 B.P.",
      "3,000 B.P."
    ],
    "answer": 1
  },
  {
    "question": "Cultural homogenization.",
    "subject": "business_ethics",
    "choices": [
      "1,3,4",
      "1,2,3",
      "1,2,3,4",
      "2,3,4"
    ],
    "answer": 1
  },
  {
    "question": "Of the ways of escaping moral arguments that he discusses, Hare claims:",
    "subject": "philosophy",
    "choices": [
      "none of them are successful.",
      "some, but not all of them are successful.",
      "all are entirely successful.",
      "all might be successful, but at a price."
    ],
    "answer": 3
  },
  {
    "question": "An employee of large manufacturing firm finds the work dull, and pursues the job only for the money. The employee performs minimally, and is not motivated so produce highest quantity or better quality. According to F. Herzberg's two-factor theory, the best way 10 increase this worker's self-motivation would be to",
    "subject": "professional_psychology",
    "choices": [
      "offer a raise and incentive pay for greater productivity",
      "redesign the job to provide a challenge and a sense of accomplishment",
      "increase opportunities for informed social interaction",
      "provide the employee with a job tide carrying greater prestige"
    ],
    "answer": 1
  },
  {
    "question": "In an e-commerce environment that requires that the information technology (IT) system be available on a continuous basis, more emphasis will be placed on which of the following aspects of the planning than in a traditional organization?",
    "subject": "professional_accounting",
    "choices": [
      "Maintain appropriate written source documents so the data can be re-entered if it is lost or compromised",
      "Maintain redundant systems for instant availability to assure the flow of transactions",
      "Review additional expenses to obtain the required amount of business interruption insurance coverage for the organization",
      "Assure that appropriate data backups are stored in an off-site location"
    ],
    "answer": 1
  },
  {
    "question": "The Space Shuttle orbits 300 km above the Earth’s surface; the Earth’s radius is 6400 km. What is the acceleration due to Earth’s gravity experienced by the Space Shuttle?",
    "subject": "high_school_physics",
    "choices": [
      "4.9 m/s^2",
      "8.9 m/s^2",
      "9.8 m/s^2",
      "10.8 m/s^2"
    ],
    "answer": 1
  },
  {
    "question": "Statement 1 | The image of a group of 6 elements under a homomorphism may have 12 elements. Statement 2 | There is a homomorphism of some group of 6 elements into some group of 12 elements.",
    "subject": "abstract_algebra",
    "choices": [
      "True, True",
      "False, False",
      "True, False",
      "False, True"
    ],
    "answer": 3
  },
  {
    "question": "At which of the following locations does bile enter the digestive tract?",
    "subject": "anatomy",
    "choices": [
      "Gastroesophageal sphincter",
      "Duodenum",
      "Ileocecum",
      "Jejunum"
    ],
    "answer": 1
  },
  {
    "question": "This question refers to the following information.\nIs it not unity alone that can weld us into an effective force, capable of creating our own progress and making our valuable contribution to world peace? Which independent African state will claim that its financial structure and banking institutions are fully harnessed to its national development? Which will claim that its material resources and human energies are available for its own national aspirations? We are fast learning that political independence is not enough to rid us of the consequences of colonial rule. We have been too busy nursing our separate states to understand fully the basic need for union, rooted in common purpose, common planning and common endeavour.\nGhana's president, Kwame Nkrumah, addressing the Organization of African Unity, 1963\nThe speaker in the passage above is espousing which of the following causes?",
    "subject": "high_school_world_history",
    "choices": [
      "Nationalism",
      "Socialism",
      "Pan-Africanism",
      "Neocolonialism"
    ],
    "answer": 2
  },
  {
    "question": "Monte Alban is located in the ________ and was built by the _________.",
    "subject": "prehistory",
    "choices": [
      "Valley of Mexico; Aztec.",
      "Valley of Oaxaca; Zapotec.",
      "Amazon floodplain; Olmec.",
      "Yucatán Peninsula; Maya."
    ],
    "answer": 1
  },
  {
    "question": "Sauna use, sometimes referred to as \"sauna bathing,\" is characterized by short-term passive exposure to extreme heat. This exposure elicits mild hyperthermia – an increase in the body's core temperature – that induces a thermoregulatory response involving neuroendocrine, cardiovascular, and cytoprotective mechanisms that work together to restore homeostasis and condition the body for future heat stressors… In recent decades, sauna bathing has emerged as a means to increase lifespan and improve overall health, based on compelling data from observational, interventional, and mechanistic studies. Of particular interest are the findings from studies of participants in the Kuopio Ischemic Heart Disease Risk Factor (KIHD) Study, an ongoing prospective population-based cohort study of health outcomes in more than 2,300 middle-aged men from eastern Finland, which identified strong links between sauna use and reduced death and disease… The KIHD findings showed that men who used the sauna two to three times per week were 27 percent less likely to die from cardiovascular-related causes than men who didn't use the sauna.[2] Furthermore, the benefits they experienced were found to be dose-dependent: Men who used the sauna roughly twice as often, about four to seven times per week, experienced roughly twice the benefits – and were 50 percent less likely to die from cardiovascular-related causes.[2] In addition, frequent sauna users were found to be 40 percent less likely to die from all causes of premature death. These findings held true even when considering age, activity levels, and lifestyle factors that might have influenced the men's health.[2]... The KIHD also revealed that frequent sauna use reduced the risk of developing dementia and Alzheimer's disease in a dose-dependent manner. Men who used the sauna two to three times per week had a 66 percent lower risk of developing dementia and a 65 percent lower risk of developing Alzheimer's disease, compared to men who used the sauna only one time per week… The health benefits associated with sauna use extended to other aspects of mental health, as well. Men participating in the KIHD study who used the sauna four to seven times per week were 77 percent less likely to develop psychotic disorders, regardless of the men's dietary habits, socioeconomic status, physical activity, and inflammatory status (as measured by C-reactive protein)…Exposure to high temperature stresses the body, eliciting a rapid, robust response. The skin and core body temperatures increase markedly, and sweating ensues. The skin heats first, rising to 40°C (104°F), and then changes in core body temperature occur, rising slowly from 37°C (98.6°F, or normal) to 38°C (100.4°F) and then rapidly increasing to 39°C (102.2°F)…  Cardiac output, a measure of the amount of work the heart performs in response to the body's need for oxygen, increases by 60 to 70 percent, while the heart rate (the number of beats per minute) increases and the stroke volume (the amount of blood pumped) remains unchanged.[5] During this time, approximately 50 to 70 percent of the body's blood flow is redistributed from the core to the skin to facilitate sweating. The average person loses approximately 0.5 kg of sweat while sauna bathing.[11] Acute heat exposure also induces a transient increase in overall plasma volume to mitigate the decrease in core blood volume. This increase in plasma volume not only provides a reserve source of fluid for sweating, but it also acts like the water in a car's radiator, cooling the body to prevent rapid increases in core body temperature and promoting heat tolerance… Repeated sauna use acclimates the body to heat and optimizes the body's response to future exposures, likely due to a biological phenomenon known as hormesis, a compensatory defense response following exposure to a mild stressor that is disproportionate to the magnitude of the stressor. Hormesis triggers a vast array of protective mechanisms that not only repair cell damage but also provide protection from subsequent exposures to more devastating stressors… The physiological responses to sauna use are remarkably similar to those experienced during moderate- to vigorous-intensity exercise. In fact, sauna use has been proposed as an alternative to exercise for people who are unable to engage in physical activity due to chronic disease or physical limitations.[13]\n\nBased on the article, which of the following statements is the author likely to agree with?",
    "subject": "college_medicine",
    "choices": [
      "Heart surgery patients who cannot run on treadmills may benefit from sauna use.",
      "Patients on a diet would benefit from sauna use.",
      "Salt restriction would be equal to sauna use for hypertensive patients.",
      "Patients with skin conditions may be cured with sauna use."
    ],
    "answer": 0
  },
  {
    "question": "A department store had suffered a succession of thefts of merchandise over a period of months. From reports by employees and customers, the department store's manager concluded that the losses were due, wholly or in large part, to the depredations of a female shoplifter, aged 30 to 40 years, about 5 feet 5 inches in height, with red hair and green eyes, who usually wore a suit. This information was passed on to all of the employees of the department store. One day, a woman entered the store to purchase accessories. The woman was 5 feet 5 inches tall, 37 years old, red-haired and green-eyed, and dressed in a smartly tailored suit. She carried a large shopping bag. The manager noticed her as she picked up, examined, and put down a number of gloves and scarves. After a while, she looked about tentatively, and then started to walk out, swinging her bag. The manager intercepted her and, standing in front of her, politely asked the woman if she would accompany her to the store manager's office. When the woman asked for an explanation, the manager told her of the store's recent experience and the suspicion that the woman might be concealing pilfered merchandise in her bag. Flushing angrily, the woman replied, \"Very well,\" and followed her to the office. Once there, the manager began to question the woman quite intensively. After the questioning, the manager then asked the woman's permission to inspect the contents of her shopping bag. At first, the woman curtly refused and announced that she had had enough of this nonsense. When she rose to go, the manager told her, \"Listen, unless you let me look inside that bag, I'm going to call the police. \" The woman replied, \"Very well,\" and handed her the bag. The manager inspected the contents of the bag thoroughly but did not find any pilfered merchandise. She then gave the woman permission to leave. The total length of the woman's detention was 30 minutes. If the woman asserts a claim for false imprisonment against the department store, she will most likely",
    "subject": "professional_law",
    "choices": [
      "prevail, because she was detained for an unreasonably long period of time.",
      "prevail, because the manager did not have reasonable grounds to suspect that the woman had committed a theft.",
      "not prevail, because under the circumstances, the manager had reasonable grounds to suspect that the woman had committed a theft.",
      "not prevail, because the manager gave the woman permission to leave after conducting her investigation."
    ],
    "answer": 0
  },
  {
    "question": "Which language family is most widely spoken in North America and Europe and includes Baltic, Celtic, Germanic, and Greek?",
    "subject": "high_school_geography",
    "choices": [
      "Dravidian",
      "Uralic-Altaic",
      "Sino-Tibetan",
      "Indo-European"
    ],
    "answer": 3
  },
  {
    "question": "For which of these two scenarios does the main character (who uses I/me/my) do something clearly morally wrong, according to ordinary moral standards in the US as of 2020? Scenario 1 | I decided to cook a potato for my girlfriend. Scenario 2 | I cornered the rat forcing it to go outside",
    "subject": "moral_scenarios",
    "choices": [
      "Wrong, Wrong",
      "Wrong, Not wrong",
      "Not wrong, Wrong",
      "Not wrong, Not wrong"
    ],
    "answer": 3
  },
  {
    "question": "How does rubella cause foetal abnormalities?",
    "subject": "virology",
    "choices": [
      "By crossing the placenta early in pregnancy and infecting the foetus",
      "By only infecting the placenta",
      "By inducing cytokines and chemokines in the mother",
      "By raising the temperature of the mother and inducing an abnormal immune reaction to the foetus"
    ],
    "answer": 0
  },
  {
    "question": "Find the opposite of the number −7.",
    "subject": "elementary_mathematics",
    "choices": [
      "7",
      "−7",
      "0.7",
      "−7.7"
    ],
    "answer": 0
  },
  {
    "question": "Silver metal, often amalgamated with mercury, is used to reduce substances to a desired oxidation state. If the silver metal amalgam cannot be used because of concerns about mercury, which of the following would be a reasonable and safe substitute?",
    "subject": "high_school_chemistry",
    "choices": [
      "H+(aq)",
      "Na(s)",
      "Ca2+(aq)",
      "Mg(s)"
    ],
    "answer": 3
  },
  {
    "question": "A 52-year-old man is brought to the emergency department 30 minutes after he had an episode of chest pain radiating to his jaw while shoveling snow. His pulse is 80/min, and blood pressure is 130/70 mm Hg. The lungs are clear to auscultation. Cardiac examination shows an S4. While undergoing an ECG, the patient says that he feels the chest pain returning. The most appropriate immediate treatment is a drug with which of the following mechanisms of action?",
    "subject": "professional_medicine",
    "choices": [
      "Increases cAMP concentration",
      "Increases nitric oxide concentration",
      "Inhibits potassium flux",
      "Inhibits sodium flux"
    ],
    "answer": 1
  },
  {
    "question": "For which of these two scenarios does the main character (who uses I/me/my) do something clearly morally wrong, according to ordinary moral standards in the US as of 2020? Scenario 1 | I voted twice in the presidential election. Scenario 2 | I rolled the grocery cart to my car.",
    "subject": "moral_scenarios",
    "choices": [
      "Wrong, Wrong",
      "Wrong, Not wrong",
      "Not wrong, Wrong",
      "Not wrong, Not wrong"
    ],
    "answer": 1
  },
  {
    "question": "A mechanism is a sequence of elementary reactions that add up to the overall reaction stoichiometry. A substance that is produced in one elementary reaction and consumed in another is called",
    "subject": "high_school_chemistry",
    "choices": [
      "a catalyst",
      "an intermediate",
      "a reactant",
      "a complex"
    ],
    "answer": 1
  },
  {
    "question": "A 22-year-old woman comes to the office because of urticaria. This is her first episode of urticaria and it has occurred and then resolved several times in the past week. The history and physical examination disclose no abnormalities. Which of the following is the most appropriate course of action?",
    "subject": "professional_medicine",
    "choices": [
      "Determine the serum IgE concentration",
      "Determine the total eosinophil count",
      "Refer her to an allergist",
      "Treat the symptoms"
    ],
    "answer": 3
  },
  {
    "question": "For which of these two scenarios does the main character (who uses I/me/my) do something clearly morally wrong, according to ordinary moral standards in the US as of 2020? Scenario 1 | I spent my afternoon swimming in the pool. Scenario 2 | I made my partner scream for help the entire evening.",
    "subject": "moral_scenarios",
    "choices": [
      "Wrong, Wrong",
      "Wrong, Not wrong",
      "Not wrong, Wrong",
      "Not wrong, Not wrong"
    ],
    "answer": 2
  },
  {
    "question": "If you were to travel at a speed close to the speed of light, you could notice that your own",
    "subject": "conceptual_physics",
    "choices": [
      "mass changes.",
      "pulse decreases.",
      "Both of these.",
      "Neither of these."
    ],
    "answer": 3
  },
  {
    "question": "Form A of a standardized personality test was given in the fall and again in the spring co the same group of people. The reliability estimate that resulted from this research is referred to as",
    "subject": "professional_psychology",
    "choices": [
      "external consistency",
      "equivalence",
      "stability",
      "internal consistency"
    ],
    "answer": 2
  },
  {
    "question": "All of the following statements are true EXCEPT",
    "subject": "high_school_biology",
    "choices": [
      "thyroxine increases the rate of metabolism",
      "insulin decreases storage of glycogen",
      "vasopressin stimulates water reabsorption in the kidney",
      "epinephrine increases blood sugar levels and heart rate"
    ],
    "answer": 1
  },
  {
    "question": "For which of these two scenarios does the main character (who uses I/me/my) do something clearly morally wrong, according to ordinary moral standards in the US as of 2020? Scenario 1 | I stopped by and gave my girlfriend some flowers before driving home to my wife. Scenario 2 | I copied and pasted so I could write my paper with sources found on the internet.",
    "subject": "moral_scenarios",
    "choices": [
      "Wrong, Wrong",
      "Wrong, Not wrong",
      "Not wrong, Wrong",
      "Not wrong, Not wrong"
    ],
    "answer": 0
  },
  {
    "question": "The majority of Kurds are found in which country?",
    "subject": "high_school_geography",
    "choices": [
      "Iran",
      "Iraq",
      "Turkey",
      "Egypt"
    ],
    "answer": 2
  },
  {
    "question": "Including the bottom how many sides are on a square-based pyramid?",
    "subject": "miscellaneous",
    "choices": [
      "three",
      "four",
      "five",
      "six"
    ],
    "answer": 2
  },
  {
    "question": "One of the following is the primary function of an oscillator",
    "subject": "electrical_engineering",
    "choices": [
      "produces sinusoidal oscillations",
      "generates non sinusoidal waveforms",
      "generates sustained oscillations at a constant amplitude and specific frequency",
      "none of the above"
    ],
    "answer": 2
  },
  {
    "question": "In what ways, if any, can the environment be considered a security concern?",
    "subject": "security_studies",
    "choices": [
      "Environmental security entails a consideration of the security of the global environment, as well as its nested sub-systems and social systems beyond the boundaries of the nation state.",
      "Environmental security is a critical security project in that it questions who and what is to be secured and from what threat by orthodox security policies, or whether linkages between environmental, security and development issues can be made.",
      "Environmental security is a practical endeavour to assess how environmental change causes violent conflict within and between countries, and the ways in which environmental security can undermine national security.",
      "All of these options. The environment is both an object to be secured and a source of risk, although it may mean different things to different people. Whilst deepening the concept of security it has both critical and practical dimensions although the utility of the concept is contested."
    ],
    "answer": 3
  },
  {
    "question": "________ are a business ethics management tool that have grown over the last few decades. Areas which these typically cover are compliance, corruption and environmental issues. However, they are constantly evolving, with for example, the onus on __________ having grown in recent years.",
    "subject": "business_ethics",
    "choices": [
      "Annual reports, Company financial performance",
      "Annual report, Internet - social media and networking",
      "Codes of ethics, Company financial performance",
      "Codes of ethics, Internet - social media and networking"
    ],
    "answer": 3
  },
  {
    "question": "If an iron nucleus split in two, its fission fragments would have",
    "subject": "conceptual_physics",
    "choices": [
      "less mass per nucleon",
      "more mass per nucleon",
      "the same mass per nucleon",
      "either more or less mass per nucleon"
    ],
    "answer": 1
  },
  {
    "question": "In one metropolitan region, technical writers have an annual salary that is approximately normally distributed with a mean of $55,800. The first quartile of salaries is $48,815. What is the standard deviation?",
    "subject": "high_school_statistics",
    "choices": [
      "$6,984 ",
      "$10,356 ",
      "$10,476 ",
      "$13,968 "
    ],
    "answer": 1
  },
  {
    "question": "What is the communal meal offered at the place of worship called in Sikhism?",
    "subject": "world_religions",
    "choices": [
      "Sangat",
      "Langar",
      "Gurdwara",
      "Panth"
    ],
    "answer": 1
  },
  {
    "question": "For which of these two scenarios does the main character (who uses I/me/my) do something clearly morally wrong, according to ordinary moral standards in the US as of 2020? Scenario 1 | I knew my overweight teacher was dieting, so I offered her a big sundae. Scenario 2 | I found a wallet in the park and became its new owner.",
    "subject": "moral_scenarios",
    "choices": [
      "Wrong, Wrong",
      "Wrong, Not wrong",
      "Not wrong, Wrong",
      "Not wrong, Not wrong"
    ],
    "answer": 0
  },
  {
    "question": "A state law imposes penalties for \"any public statement containing false or misleading information about a service or product.\" An airline falsely claimed in an advertisement that its competitor had an inferior safety record. The claim was based on erroneous information, found on the website of a nonprofit consumer advocacy group, that the airline assumed to be true. The airline was charged under the state law for making a false statement. No federal statute applies. Which of the following best supports the airline in a defense based on the First Amendment?",
    "subject": "professional_law",
    "choices": [
      "Its statement about the safety record was made without malice.",
      "Its statement about the safety record was protected noncommercial speech.",
      "The state law is a prior restraint.",
      "The state law is overbroad."
    ],
    "answer": 3
  },
  {
    "question": "When Berger & Luckmann said that reality is socially constructed, they meant:",
    "subject": "sociology",
    "choices": [
      "scientists are guided in their work by social values and interests, so they define and measure phenomena that will support their theories",
      "people negotiate shared definitions of their situation and live according to these, often forgetting that these social worlds are not fixed and external",
      "sociologists decide what constitutes social reality and measure only that",
      "terms like 'reality' have no deeper meaning beyond the level of discourse"
    ],
    "answer": 1
  },
  {
    "question": "If c > 0 and f(x) = e^x - cx for all real numbers x, then the minimum value of f is",
    "subject": "college_mathematics",
    "choices": [
      "f(c)",
      "f(e^c)",
      "f(1/c)",
      "f(log c)"
    ],
    "answer": 3
  },
  {
    "question": "These factors increase risk of osteoporotic fracture:",
    "subject": "nutrition",
    "choices": [
      "High bone mineral density",
      "High body weight",
      "High lean mass",
      "Poor muscle strength"
    ],
    "answer": 3
  },
  {
    "question": "To prevent desiccation and injury, the embryos of terrestrial vertebrates are encased within a fluid secreted by the",
    "subject": "college_biology",
    "choices": [
      "amnion",
      "chorion",
      "allantois",
      "yolk sac"
    ],
    "answer": 0
  },
  {
    "question": "Let A be a finite set with m elements, and let B be a finite set with n elements. The number of distinct functions mapping A into B is",
    "subject": "college_computer_science",
    "choices": [
      "n^m",
      "n!/(n - m)!",
      "n!",
      "n!/(m!(n - m)!)"
    ],
    "answer": 0
  },
  {
    "question": "A disk of radius 0.1 m initially at rest undergoes an angular acceleration of 2.0 rad/s^2. If the disk only rotates, find the total distance traveled by a point on the rim of the disk in 4.0 s.",
    "subject": "high_school_physics",
    "choices": [
      "0.4 m",
      "0.8 m",
      "1.2 m",
      "1.6 m"
    ],
    "answer": 3
  },
  {
    "question": "Identify the only construct that is not pertinent to developmental models on intelligence:",
    "subject": "professional_psychology",
    "choices": [
      "Investment theory",
      "The positive manifold",
      "G theory",
      "Primary mental ability theory"
    ],
    "answer": 0
  },
  {
    "question": "Which of the following statements does NOT accurately describe voting behavior in the United States?",
    "subject": "high_school_government_and_politics",
    "choices": [
      "Registered voters between the ages of 35 and 45 are more likely to vote than are those under the age of 21.",
      "A registered voter who has attained his or her General Educational Development (GED) is less likely to vote than a high school dropout.",
      "Registered voters are more likely to vote in general elections than they are in primary elections.",
      "More women than men have voted in every presidential election since 1980."
    ],
    "answer": 1
  },
  {
    "question": "For which of these two scenarios does the main character (who uses I/me/my) do something clearly morally wrong, according to ordinary moral standards in the US as of 2020? Scenario 1 | When I checked out from the hotel I turned in the dirty towels. Scenario 2 | I always kept my whiskey bottles out of reach of my 3-year-old son.",
    "subject": "moral_scenarios",
    "choices": [
      "Wrong, Wrong",
      "Wrong, Not wrong",
      "Not wrong, Wrong",
      "Not wrong, Not wrong"
    ],
    "answer": 3
  },
  {
    "question": "A state imposes a graduated income tax upon net income calculated under federal law. Section 22 of the city's reform act of 2010, which is to become effective on January 1, 2010, provides: \"Any parent or guardian financially responsible for the education of his ward may claim a direct tax credit against his income tax liability equal to the amount of tuition of a child or children of high school age who does not attend a public high school. \" Other provisions define \"tuition\" very broadly but limit the credit to tuition paid to schools meeting the educational requirements as determined by the state. On December 1, 2009, the parents of two students who attend a public high school in the state sue for a declaratory judgment and injunction in federal court, claiming that Section 22 violates the establishment clause of the First Amendment. The federal court will most likely",
    "subject": "professional_law",
    "choices": [
      "dismiss the action, because the suit involves a political question.",
      "dismiss the action, because the plaintiffs lack standing as taxpayers.",
      "dismiss the action, because the issues are not ripe.",
      "dismiss the action, because the issues being litigated are moot."
    ],
    "answer": 2
  },
  {
    "question": "A member of the president's cabinet is said to have \"gone native\" when that cabinet member",
    "subject": "high_school_government_and_politics",
    "choices": [
      "resigns to take a position as a consultant to lobbying groups",
      "cedes control of his or her department to lifelong bureaucrats within the department",
      "places his or her department's priorities above the president's",
      "accepts bribes or expensive favors from businesses regulated by his or her department"
    ],
    "answer": 2
  },
  {
    "question": "Order the following (risk, return) pairs from least to most favourable, assuming the perspective of a rational and risk-averse investor: (2,2),(2,3) and (4,2). Risk is measured in standard deviations and return in percentage. HINT: Imagine a scatter diagram with standard deviation on the x-axis and return on the y-axis.",
    "subject": "professional_accounting",
    "choices": [
      "(4,2),(2,2),(2,3)",
      "(2,2),(2,3),(4,2)",
      "(2,2),(4,2),(2,3)",
      "(2,3),(2,2),(4,2)"
    ],
    "answer": 0
  },
  {
    "question": "What is the main reason why many Critical Race Theorists are hostile to concepts such as 'justice', 'neutrality', and 'truth'?",
    "subject": "jurisprudence",
    "choices": [
      "Because of their vagueness.",
      "Because they have failed to produce racial justice.",
      "Because they are unrelated to contemporary conditions.",
      "Because these ideas are alien to most people of colour."
    ],
    "answer": 1
  },
  {
    "question": "What is personal (ratione personae) immunity?",
    "subject": "international_law",
    "choices": [
      "Personal immunity is afforded to all physical persons",
      "Personal immunity is that which is afforded in a personal capacity and hence does not cover conduct of the State as such",
      "Personal immunity is afforded only to particular persons irrespective if their conduct was undertaken in a private or public capacity",
      "Personal immunity is afforded to State officials for conduct undertaken in a public capacity"
    ],
    "answer": 2
  },
  {
    "question": "Who is an 'injured State' in the law of international responsibility?",
    "subject": "international_law",
    "choices": [
      "A State is 'injured' in case that it has suffered a damage from the internationally wrongful conduct",
      "A State is 'injured' in cases that there has been a violation of a peremptory norm of international law",
      "A State is 'injured' should it acknowledge the existence of the internationally wrongful conduct",
      "A State is 'injured' if the obligation breached was owed to it individually or if it was owed to a group of States, including that State, and it was specially affected"
    ],
    "answer": 3
  },
  {
    "question": "A national association brought suit in federal court against a city. The suit charged the city with violating several federal statutes. During the trial, the association's attorney called the city attorney as an adverse witness. The city attorney asserted the attorney-client privilege and objected that the matters communicated to him were intended to be confidential. The issues raised by the objections of the city attorney should be resolved under",
    "subject": "professional_law",
    "choices": [
      "federal privilege law.",
      "the privilege law of the forum state.",
      "either federal privilege law or the privilege law of the forum state as determined by the court.",
      "either federal privilege law or the privilege law of the forum state, whichever the court determines is more likely to admit the evidence."
    ],
    "answer": 0
  },
  {
    "question": "There are three main types of buying situations in an organization, referred to by Robinson, Faris, and Wind (1967) as _____________.",
    "subject": "marketing",
    "choices": [
      "Repeat purchases.",
      "Buyphases.",
      "Buyclasses.",
      "Tenders."
    ],
    "answer": 2
  },
  {
    "question": "For which of these two scenarios does the main character (who uses I/me/my) do something clearly morally wrong, according to ordinary moral standards in the US as of 2020? Scenario 1 | My mom asked me to deep clean the bath so I covered it in bleach. Scenario 2 | For the funeral, I wore my clown costume to honor the dead.",
    "subject": "moral_scenarios",
    "choices": [
      "Wrong, Wrong",
      "Wrong, Not wrong",
      "Not wrong, Wrong",
      "Not wrong, Not wrong"
    ],
    "answer": 2
  },
  {
    "question": "A ________ campaign occurs when people from two or more opposing sides of an argument have emotional convictions about a decision that has the power to impact their lives.",
    "subject": "public_relations",
    "choices": [
      "public relations",
      "public issues",
      "crisis management",
      "consumer relations"
    ],
    "answer": 1
  },
  {
    "question": "One afternoon a motorist was driving her car when she struck a pedestrian who entered the intersection. The pedestrian was seriously injured in the accident and sued the motorist to recover damages for personal injuries. There were no witnesses to the accident. The motorist claims that the traffic light was green at the time she entered the intersection. The pedestrian now has amnesia and cannot remember how the accident occurred. At trial, the pedestrian's attorney calls a witness to testify. The witness proposes to testify that she was in the emergency room at the hospital when the pedestrian was brought in following the accident. The witness further testifies that while the pedestrian was being treated for his injuries, the nurse asked him, \"How did you get hurt?\" The pedestrian replied, \"The car ran the red light and struck me as I was walking through the intersection. \"Upon objection, this evidence is",
    "subject": "professional_law",
    "choices": [
      "admissible as a statement made for purposes of medical treatment and diagnosis.",
      "admissible as a present sense impression.",
      "inadmissible, because the witness was eavesdropping on a confidential communication between the pedestrian and a hospital representative.",
      "inadmissible, because it is hearsay not within any recognized exception."
    ],
    "answer": 3
  },
  {
    "question": "Which of the following samples would be considered most representative of male college students?",
    "subject": "high_school_psychology",
    "choices": [
      "A group of thirty fraternity brothers from Penn State",
      "A random sample taken between classes in the business wing of various universities",
      "Sixty male members of each class from Princeton, Yale, Harvard, Dartmouth, and Columbia",
      "Twenty male members of each class from a cross-section of colleges and universities"
    ],
    "answer": 3
  },
  {
    "question": "Which statement below is the least likely to follow logically from Dworkin's notion of law as integrity?",
    "subject": "jurisprudence",
    "choices": [
      "It is likely to generate more individual rights and greater liberty.",
      "It renders a community more genuine.",
      "It opens the door to authoritarianism.",
      "It improves the moral justification for the exercise of political power."
    ],
    "answer": 2
  },
  {
    "question": "X-chromosome inactivation",
    "subject": "medical_genetics",
    "choices": [
      "results in genetically turning off one of the two X chromosomes in female mammals",
      "takes place in humans so that the same X chromosome is inactive in all of the cells of a female",
      "is the cause of the Y chromosome being genetically inactive",
      "occurs in fruit flies but not in mammals"
    ],
    "answer": 0
  },
  {
    "question": "In the fetus, the ductus arteriosus passes blood from the",
    "subject": "anatomy",
    "choices": [
      "pulmonary vein to the aorta.",
      "aorta to pulmonary vein.",
      "pulmonary artery to the aorta.",
      "aorta to the pulmonary artery."
    ],
    "answer": 2
  },
  {
    "question": "The follicular phase is to the __________ as the luteal phase is to the secretory phase.",
    "subject": "human_sexuality",
    "choices": [
      "postovulatory",
      "menstrual",
      "proliferative",
      "myometrial"
    ],
    "answer": 2
  },
  {
    "question": "Buffer-overflow may remain as a bug in apps if __________ are not done fully.",
    "subject": "computer_security",
    "choices": [
      "boundary hacks",
      "memory checks",
      "boundary checks",
      "buffer checks"
    ],
    "answer": 2
  },
  {
    "question": "Let T be a depth-first search tree of a connected undirected graph G. For each vertex v of T, let pre(v) be the number of nodes visited up to and including v during a preorder traversal of T, and post(v) be the number of nodes visited up to and including v during a postorder traversal of T. The lowest common ancestor of vertices u and v in T is a vertex w of T such that w is an ancestor of both u and v, and no child of w is an ancestor of both u and v. Let (u, v) be an edge in G that is not in T, such that pre(u) < pre(v). Which of the following statements about u and v must be true?\nI. post(u) < post(v)\nII. u is an ancestor of v in T.\nIII. If w is the lowest common ancestor of u and v in T, then w = u.",
    "subject": "college_computer_science",
    "choices": [
      "I only",
      "II only",
      "III only",
      "II and III"
    ],
    "answer": 3
  },
  {
    "question": "This question refers to the following information.\nEvery two months His Majesty sends from Lima 60,000 pesos to pay for the mita of the Indians. Up on the Huanacavelica range there are 3,000 or 4,000 Indians working in the mercury mine, with picks and hammers, breaking up the ore. And when they have filled up their little sacks, the poor fellows, loaded down, climb up those ladders and rigging, so distressing that a man can hardly get up them. That is the way they work in this mine, with many lights and the loud noise of the pounding and great confusion. Nor is that the greatest evil; that is due to thievish and undisciplined superintendents. According to His Majesty's warrant, the mine owners at Potosí have a right to the mita of 13,300 Indians. These mita Indians earn each day 4 reals. Besides these there are others not under obligation, who hire themselves out voluntarily: these each get from 12 to 16 reals, and some up to 24, according to how well they wield their picks or their reputation for knowing how to get the ore out.\nAntonio Vasquez de Espinosa, report on mining in Huanacavelica and Potosí, 1620s\nThe third principal reason the local Yakut and Tungus natives are ruined is that from the time they first came under Russian control, they have been forced to pay yasak tribute. Some have paid in sables, others in red foxes, still others in cash. At first there were plenty of furbearing animals there, but now there are no sables and not many foxes in those lands, from the shores of the Arctic Ocean all the way south to the great Lena River. Moreover, almost half the natives cannot hunt because they no longer have horses, many of which have been pawned to the yasak collectors.\nHeinrich von Füch, \"On the Treatment of Natives in Northeast Siberia,\" 1744\nBoth passages are best seen in the context of which of the following broad developments?",
    "subject": "high_school_world_history",
    "choices": [
      "Emerging systems of coerced labor",
      "The expansion of chattel slavery",
      "Increased reliance on prison-camp workforces",
      "Colonization of overseas territories by joint-stock companies"
    ],
    "answer": 0
  },
  {
    "question": "A soccer team has $90.00 to buy soccer balls. If one soccer ball costs $15.60, what is the greatest number of soccer balls the team can buy?",
    "subject": "elementary_mathematics",
    "choices": [
      "4",
      "5",
      "6",
      "7"
    ],
    "answer": 1
  },
  {
    "question": "Current estimates of how many people exercise on a regular basis suggest that _____ do",
    "subject": "human_aging",
    "choices": [
      "Less than 50%",
      "More than 75%",
      "Less than 25%",
      "More than 50%"
    ],
    "answer": 0
  },
  {
    "question": "An object carries a charge of –1 C. How many excess electrons does it contain?",
    "subject": "high_school_physics",
    "choices": [
      "6.25 × 10^18",
      "8.00 × 10^18",
      "1.60 × 10^19",
      "3.20 × 10^19"
    ],
    "answer": 0
  },
  {
    "question": "According to Socrates, it is important that we discover what makes a particular action (e.g., a merciful or just act) the kind of action that it is, because without such knowledge:",
    "subject": "philosophy",
    "choices": [
      "no one in society will ever do any action that really is merciful or just, only those actions that they think are merciful or just.",
      "the primary purpose of human existence--which is to think and to know--is replaced by a focus on morality (acting and doing).",
      "we can refer only to how people characterize actions without knowing why such actions should be characterized that way.",
      "there would be no way to distinguish one kind of action (e.g., a merciful action) from another kind of action (e.g., a just action)."
    ],
    "answer": 2
  },
  {
    "question": "A woman leased a condo from the owner for a period of one year. After six months, the owner gave the woman a written option to purchase the condo for $100,000 before the expiration of the lease. With the owner's approval, the woman spent $10,000 to have the kitchen remodeled to her personal specifications. One month before the end of the lease, the owner notified the woman that he was revoking the option to purchase the condo. One week later, the woman delivered a written notice of acceptance of the option, but the owner refused to sell. If the woman initiates suit for breach of contract, which of the following is her strongest argument that an enforceable contract was formed between her and the owner?",
    "subject": "professional_law",
    "choices": [
      "Because the woman had until the expiration of the lease to accept the offer, the owner's revocation would be ineffective.",
      "Because the owner was a merchant, the written offer was irrevocable for a period not exceeding three months.",
      "Because the owner's offer invited a return promise as acceptance, the woman manifested her intent to accept by remodeling the kitchen.",
      "After the woman paid to have the kitchen remodeled, an option contract resulted, because the owner knew the woman was relying on the offer to her detriment."
    ],
    "answer": 3
  },
  {
    "question": "What does the presence of discouraged workers do to the measurement of the unemployment rate?",
    "subject": "high_school_macroeconomics",
    "choices": [
      "Discouraged workers are counted as \"out of the labor force\" thus the unemployment rate is understated making the economy look stronger than it is.",
      "Discouraged workers are counted as \"out of the labor force\" thus the unemployment rate is understated making the economy look weaker than it is.",
      "Discouraged workers are not surveyed so there is no impact on the unemployment rate.",
      "Discouraged workers are counted as \"unemployed\" thus the unemployment rate is understated making the economy look stronger than it is."
    ],
    "answer": 0
  },
  {
    "question": "In the film 'The Talented Mr Ripley' who plays Mr Ripley?",
    "subject": "miscellaneous",
    "choices": [
      "Jude Law",
      "Matt Damon",
      "Dustin Hoffman",
      "Ben Affleck"
    ],
    "answer": 1
  },
  {
    "question": "Which of the following allows gas exchange in the lungs?",
    "subject": "anatomy",
    "choices": [
      "Alveoli",
      "Bronchi",
      "Bronchioles",
      "Capillaries"
    ],
    "answer": 0
  },
  {
    "question": "Anscombe criticizes as absurd Kant’s idea of:",
    "subject": "philosophy",
    "choices": [
      "the thing in itself.",
      "the categorical imperative.",
      "the phenomenal self.",
      "legislating for oneself."
    ],
    "answer": 3
  },
  {
    "question": "Select the best translation into predicate logic. Some firefighters rescue victims from danger. (Dx: x is danger; Fx: x is a firefighter; Vx: x is a victim; Rxyz: x rescues y from z)",
    "subject": "formal_logic",
    "choices": [
      "(∃x){Fx • (∀y)[Dy ⊃ (∃z)(Vz • Rxyz)]}",
      "(∃x){Fx • (∃y)[Vy • (∃z)(Dz • Rxyz)]}",
      "(∃x){Fx • (∃y)(∃z)[(Vy • Dz) • Rxzy]}",
      "(∀x){Fx ⊃ (∃y)[Vy . (∃z)(Dz • Rxyz)]}"
    ],
    "answer": 1
  },
  {
    "question": "During a clinical study examining the effects of exercise, men between the ages of 20 and 30 years are evaluated during a 15- minute session on a treadmill. The average pulse for the last 2 minutes of the session is 175/min. During the last minute of exercise, various measurements are taken. Compared with the measurement before the session, which of the following is most likely to be decreased?",
    "subject": "professional_medicine",
    "choices": [
      "Pulse pressure",
      "Stroke volume",
      "Systolic blood pressure",
      "Total peripheral resistance"
    ],
    "answer": 3
  },
  {
    "question": "Which of the following was described as “the slow agency of existing causes”?",
    "subject": "prehistory",
    "choices": [
      "natural selection",
      "catastrophism",
      "uniformitarianism",
      "unilineal evolution"
    ],
    "answer": 2
  },
  {
    "question": "A car gets 24 miles per gallon of gasoline (mi/gal). How many gallons of gasoline would the car need to travel 144 miles?",
    "subject": "elementary_mathematics",
    "choices": [
      "6.5 gallons",
      "6 gallons",
      "5.5 gallons",
      "5 gallons"
    ],
    "answer": 1
  },
  {
    "question": "A school psychologist is providing feedback to a student's parents regarding the student's performance on a measure of academic achievement. To explain the concept of grade equivalent, the school psychologist should explain that it is",
    "subject": "high_school_psychology",
    "choices": [
      "the average score on that measure obtained by students in a given grade",
      "the average score on that measure obtained by students at a given age",
      "the grade in which a student should be placed in school",
      "utilized to determine accountability among peers"
    ],
    "answer": 0
  },
  {
    "question": "Global and regional international trade agreements work by using which of the following mechanisms?",
    "subject": "us_foreign_policy",
    "choices": [
      "Reciprocity across multiple issues",
      "Reputational concerns of the actors",
      "Side payments for adjusting to the organization (such as the Common Agricultural Policy in the EU)",
      "ALL of the above"
    ],
    "answer": 3
  },
  {
    "question": "When did Mohenjo-daro develop into a complex urban center?",
    "subject": "prehistory",
    "choices": [
      "during the Early Shang Dynasty, from 1,000 to 400 B.P.",
      "during the Qin Dynasty, from 3,500 to 3,000 B.P.",
      "during the Mature Harappan period, from 4,500 to 4,000 B.P.",
      "during the Early Harappan period, from 8,500 to 6,000 B.P."
    ],
    "answer": 2
  },
  {
    "question": "The Traditional Religion Advocacy Party (TRAP) has successfully lobbied the State of Texarkana for a statute named \"Equal Rights for All Religions.\" The law requires broadcasters that air segments discussing Christianity to allow equal time for segments on Judaism, Islam, Hinduism, and Buddhism. The American Atheism Association (AAA) has put together a broadcast segment about atheism, rejecting all religions, but four of the five Texarkana stations have declined to air the segment because they believe it would violate the statute. AAA has filed suit against the state, challenging the constitutionality of the statute. What is the strongest argument AAA can make in support of striking down the Equal Rights for All Religions statute?",
    "subject": "professional_law",
    "choices": [
      "The First Amendment prohibits government interference with freedom of the press.",
      "The fact that the statute involves only broadcast media and not print media is an Equal Protection violation.",
      "The First Amendment prohibits government interference with the free exercise of religion.",
      "The statute is not narrowly tailored to promote a compelling governmental interest."
    ],
    "answer": 3
  },
  {
    "question": "Adaptive thermogenesis refers to:",
    "subject": "nutrition",
    "choices": [
      "A decrease in heat loss when exposed to cold",
      "A decrease in non-shivering thermogenesis when exposed to cold",
      "An increase in basal metabolic rate that is not fully explained by a change in body composition during chronic overfeeding",
      "A decrease in spontaneous physical activity during chronic overfeeding."
    ],
    "answer": 2
  },
  {
    "question": "In all of her relationships Helen is typically uncomfortable feeling close to another person or having that person feel close to her. According to attachment theory Helen would best be described as:",
    "subject": "human_sexuality",
    "choices": [
      "a secure lover",
      "an avoidant lover",
      "an anxious-ambivalent lover",
      "a passionate lover"
    ],
    "answer": 1
  },
  {
    "question": "In primates, the location of which of the following determines if it is a quadruped or biped?",
    "subject": "prehistory",
    "choices": [
      "the feet",
      "the skull",
      "the foramen magnum",
      "the ulna"
    ],
    "answer": 2
  },
  {
    "question": "What is the meaning of collective security?",
    "subject": "international_law",
    "choices": [
      "The right to self-defence by more than one nation acting in concert",
      "The right of one's allies to defend the victim State",
      "The authorisation of armed force by the UN Security Council",
      "The authorisation of peacekeeping missions by the UN General Assembly"
    ],
    "answer": 2
  },
  {
    "question": "In the comic strip 'Peanuts' what is Schroeder known for doing?",
    "subject": "miscellaneous",
    "choices": [
      "Dancing",
      "playing football",
      "playing the piano",
      "Flying an imaginary plane"
    ],
    "answer": 2
  },
  {
    "question": "A writer's latest novel created a debate among critics regarding whether the sexual references and the graphic practices in the book made it obscene. While the publisher was readying the book for distribution, the head of a state commission for morality contacted her to tell her that the book was obscene and that she should collect all copies and turn them over for seizure by the government. He also advised that the commission was putting the book on a list of obscene works that retailers should not handle. She responded that dozens of retailers already had the book for an opening day promotion. The commission seized all of the books from the retailers and destroyed them, without any due process procedural safeguards to the author or the publisher. The author and publisher appealed the case and eventually received a writ of certiorari issued by the U.S. Supreme Court. Will the Court uphold the procedure that was used to declare the book obscene and to restrain its distribution?",
    "subject": "professional_law",
    "choices": [
      "Yes, if the authorities determine the book to be obscene, then they may seize and prevent its prospective distribution for the protection of the public.",
      "Yes, the determination of obscenity can be made prior to publication because the local authorities have a right to determine the local \"community morals\" standard.",
      "No, the state must first give the publisher and author a preliminary hearing before a magistrate to get a determination if the book is obscene.",
      "No, the state cannot exercise prior restraint over published material because that has a chilling effect on free speech; a full judicial determination, with a criminal trial, is required before there can be a finding of a work being obscene."
    ],
    "answer": 3
  },
  {
    "question": "This question refers to the following information.\n\"But you, my dear Pangloss,\" said Candide, \"how can it be that I behold you again?\"\n\"It is true,\" said Pangloss, \"that you saw me hanged&….A surgeon purchased my body, carried home, and dissected me. He began with making a crucial incision on me from the navel to the clavicula. One could not have been worse hanged than I was. The executioner of the Holy Inquisition was a sub-deacon, and knew how to burn people marvellously well, but he was not accustomed to hanging. The cord was wet and did not slip properly, and besides it was badly tied; in short, I still drew my breath, when the crucial incision made me give such a frightful scream that my surgeon fell flat upon his back&…[At length he] sewed up my wounds; his wife even nursed me. I was upon my legs at the end of fifteen days&….\nOne day I took it into my head to step into a mosque, where I saw an old Iman and a very pretty young devotee who was saying her paternosters&….She dropped her bouquet; I picked it up, and presented it to her with a profound reverence. I was so long in delivering it that the Iman began to get angry, and seeing that I was a Christian he called out for help. They carried me before the cadi, who ordered me a hundred lashes on the soles of the feet and sent me to the galleys. I was chained to the very same galley and the same bench as the young Baron. On board this galley there were four young men from Marseilles, five Neapolitan priests, and two monks from Corfu, who told us similar adventures happened daily. The Baron maintained that he had suffered greater injustice than I&….We were continually disputing, and received twenty lashes with a bull's pizzle when the concatenation of universal events brought you to our galley, and you were good enough to ransom us.\"\n\"Well, my dear Pangloss,\" said Candide to him, \"when you had been hanged, dissected, whipped, and were tugging at the oar, did you always think that everything happens for the best?\"\n\"I am still of my first opinion,\" answered Pangloss, \"for I am a philosopher and I cannot retract, especially as Leibnitz could never be wrong; and besides, the pre-established harmony is the finest thing in the world, and so is his plenum and materia subtilis.\"\nVoltaire, French Enlightenment writer, Candide, 1759\nThe themes of the passage and the mode in which Pangloss tells them show the influence of",
    "subject": "high_school_european_history",
    "choices": [
      "Medievalism",
      "Empiricism",
      "Rationalism",
      "Romanticism"
    ],
    "answer": 2
  },
  {
    "question": "Which of the following is the symplastic pathway for the movement of sucrose from the site of photosynthesis in mesophyll cells into the phloem?",
    "subject": "college_biology",
    "choices": [
      "Fibers, phloem parenchyma, companion cell, sieve tube",
      "Phloem parenchyma, fibers, bundle sheath, tracheids",
      "Companion cells, phloem parenchyma, fibers, sieve tube",
      "Bundle sheath, phloem parenchyma, companion cell, sieve tube"
    ],
    "answer": 3
  },
  {
    "question": "A 45-year-old man comes to the physician because of right shoulder pain that began after he chopped wood 2 days ago. Examination of the right upper extremity shows no obvious bone deformities or point tenderness. The pain is reproduced when the patient is asked to externally rotate the shoulder against resistance; there is no weakness. In addition to the teres minor, inflammation of which of the following tendons is most likely in this patient?",
    "subject": "professional_medicine",
    "choices": [
      "Infraspinatus",
      "Pectoralis",
      "Subscapularis",
      "Supraspinatus"
    ],
    "answer": 0
  },
  {
    "question": "Use the following key to translate the given formula of PL to natural, English sentences.\nA: Marina reads a Percy Jackson book.\nB: Izzy plays Minecraft.\nC: Emily stops working.\nD: Russell makes dinner.\nE: Ashleigh stops by.\n~C ∨ D",
    "subject": "formal_logic",
    "choices": [
      "If Emily doesn't stop working then Russell makes dinner.",
      "Emily stops working unless Russell makes dinner.",
      "Emily stops working unless Russell doesn't make dinner.",
      "Emily doesn't stop working unless Russell makes dinner."
    ],
    "answer": 3
  },
  {
    "question": "The weight percent of sodium hydroxide dissolved in water is 50%. What is the mole fraction of sodium hydroxide?",
    "subject": "high_school_chemistry",
    "choices": [
      "31.00%",
      "0.164",
      "0.311",
      "0.5"
    ],
    "answer": 2
  },
  {
    "question": "In a certain region, the electric field varies with the radius away from origin by the equation Er = –6r^2 + 4r + 3, where r is given in meters and E in N/C. The potential difference between the origin and the point (3, 4) is",
    "subject": "high_school_physics",
    "choices": [
      "–165 V",
      "–120 V",
      "64 V",
      "185 V"
    ],
    "answer": 3
  }
] as const satisfies readonly MMLUItem[];
