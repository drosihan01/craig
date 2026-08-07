/**
 * A scripted session between Ada and Craig.
 *
 * The point of the script is the argument, not the copy: Craig earns his keep
 * by finding what *isn't* written down, not by reformatting what is. Ada gives
 * him a stale handbook and a fast brain-dump; every useful thing he says comes
 * from the gap between those two.
 *
 * Voice matters here and it's easy to get wrong in the same direction twice.
 *
 * Ada: lowercase, fast, run-on, mildly self-deprecating about how scrappy it
 * all is. Heads-down building, not managing HR, and not certain of her own
 * headcount.
 *
 * Her *predicted* replies are the exception — those are written for her, not
 * by her, so they're in proper sentences. Someone picking a suggested answer
 * is putting their name to it; it should read like something they'd be happy
 * to have said.
 *
 * Craig: the enthusiastic neighbour who happens to be very good at this.
 * Friendly and genuinely pleased to be helping, but he knows what he's doing
 * and it shows — warm without being chummy, professional without being stiff.
 * Plain sentences, contractions, the occasional "honestly" or "ah". He notices
 * things and mentions them; he doesn't analyse them at you, and he never
 * performs concern. He reassures where reassurance is true — most of what Ada
 * is worried about is normal — without ever pretending a real gap isn't one.
 *
 * Shape matters as much as tone. Ada skims: she reads the first line, then her
 * eye goes hunting for a list. So Craig leads with one sentence that says the
 * thing, then bullets, then at most one line to close. Lines starting "- "
 * render as a real list. Four warm paragraphs is a message she won't finish,
 * however good it is.
 *
 * If a line could open a consulting deck — "two risks, and they're different
 * kinds" — it's wrong. No balanced clauses, no "rather than" constructions, no
 * summarising what he just said.
 *
 * Fixture data. Delete it when there's a real model behind the prompt.
 */

export interface SessionTurn {
  /** What Ada says. Offered as a one-click suggestion so the demo can be driven without typing. */
  ada: string;
  /** Shown as an attachment chip on her message. */
  attachment?: string;
  /** The states Craig moves through before answering. */
  steps: string[];
  /** Craig's reply. Blank lines separate paragraphs. */
  craig: string;
  /** Pulled out of the prose and highlighted, so the ask doesn't get lost in it. */
  question?: string;
  /**
   * Predicted replies for that question.
   *
   * They're phrasings of the same answer, not different answers. The script is
   * linear, so an option that changed what Ada actually said would make Craig's
   * next turn incoherent — and a demo that contradicts itself is worse than one
   * with fewer choices.
   */
  replies?: string[];
  /** Offers the draft workflow at the end of the reply. */
  offersWorkflow?: boolean;
}

export const SESSION: SessionTurn[] = [
  {
    ada: "ok so katalis — we're ai infra. model routing, fallback, cost + latency monitoring for teams running a few providers or self-hosted stuff in prod. basically the boring plumbing so nobody has to hand-roll their own inference layer. team is me, jason (cofounder, technical, owns basically all the infra) and matty who does frontend, contract, maybe 2 days a week? attached the handbook but fair warning i wrote it at 11pm before a fundraise call in feb and haven't touched it since. first hire starts in 2 weeks — nils, infra guy, coming from a much bigger place, like 400 people",
    attachment: "Katalis_Handbook_OLD.pdf",
    steps: [
      "Reading Katalis_Handbook_OLD.pdf",
      "Lining it up with what you just told me",
      "Looking for what isn't written down",
    ],
    craig:
      "Ah brilliant, thanks — had a proper read. Genuinely more than enough to work with.\n\nWhat I've got:\n- Three of you, and Jason owns basically all the infra\n- Matty's on contract, two days a week\n- Handbook's from February, four bullets about week one\n- Nils starts in two weeks, coming from a 400-person place\n\nThat last one's the bit I'd think about. He's used to things being written down.",
    question:
      "Two quick ones and I'll have plenty. Is Jason still the only one who can hand out GitHub and AWS? And what actually happens if someone pushes to prod in their first week?",
    replies: [
      "Jason owns all of it — GitHub, AWS, the provider keys. And realistically, they could take routing down for a customer.",
      "All Jason. Prod's the real risk — it would be easy to knock routing over without realising.",
      "Jason holds every key. We've broken prod ourselves before; it's recoverable, but not something you want happening on day three.",
    ],
  },
  {
    ada: "yeah jason owns all of it, github aws the provider keys all of it. i could probably do github at a push but i'd have to ask him where things are which kind of proves your point lol. prod — realistically they'd break routing for someone. we've done it, it's recoverable, but i'd rather they didn't do it on day 3 without knowing what's live and what's fallback",
    steps: [
      "Working out what needs doing before day one",
      "Checking what's stuck behind what",
    ],
    craig:
      "Ah that's really useful, thank you.\n\nTwo things worth saying out loud:\n- Everything Nils needs on day one goes through Jason — keys, accounts, and whatever's only in his head\n- He's in Berlin, so that's a two-hour overlap on a good day\n\n“Just ask Jason” is really a two-hour window, and someone who won't ask twice will guess instead.",
    question:
      "One more and then I'll put something together — who's the first person Nils talks to who isn't you or Jason?",
    replies: [
      "Nobody, realistically. Matty's part-time and remote — they'd barely overlap.",
      "There isn't one. Matty's around two days a week, and that's it.",
      "No one. Which is a problem, isn't it.",
    ],
  },
  {
    ada: "...nobody lol. matty i guess but he's part time and remote and i don't think they'd overlap much. that's bad isn't it",
    steps: ["Putting a workflow together"],
    craig:
      "Honestly? Completely normal at three people. I wouldn't lose sleep over it.\n\nHere's what I'd put together:\n- Contract first — signing it is what gets him an account here\n- Then payroll, right to work, and picking up the laptop\n- Accounts one at a time: Google Workspace, then Slack, GitHub, Linear\n- MFA right behind Workspace and behind GitHub, so he can't skip either\n- Vanta last: policies, training, device agent\n\nTwo bits I've left open rather than guessing — which right-to-work check applies in Germany, and which Slack channels he actually needs.\n\nGive me a second and I'll write it.",
    offersWorkflow: true,
  },
];

/**
 * Demo v2 — the same company, but Ada is the only one in Craig.
 *
 * Katalis is still three people. Jason and Matty exist, get talked about, and
 * own real work — they just don't have accounts. That's the honest v1 scope:
 * one admin, and everybody else is somebody she chases.
 *
 * It's also the more interesting version. A step that belongs to Jason but is
 * tracked against Ada is exactly the situation Craig is for — she's the one
 * who'll be asked why Nils can't log in, whether or not she's the one who was
 * supposed to fix it.
 *
 * Same voice rules as above.
 */
export const SESSION_V2: SessionTurn[] = [
  {
    ada: "ok so katalis — ai infra. model routing, fallback, cost and latency monitoring for teams running a few providers in prod. basically the boring plumbing so nobody has to hand-roll their own inference layer. team is me, jason (cofounder, technical, owns basically all the infra) and matty who does frontend on contract, maybe 2 days a week. attached the handbook, fair warning i wrote it at 11pm before a fundraise call in feb and haven't opened it since. first hire starts in 2 weeks — nils, infra guy, coming from a much bigger place, like 400 people",
    attachment: "Katalis_Handbook_OLD.pdf",
    steps: [
      "Reading the handbook",
      "Comparing it to what you just said",
      "Working out what's missing",
    ],
    craig:
      "Right, got it. Read the handbook — four bullets under “first week”, which is four more than most people have.\n\nThe bit I'd flag isn't the handbook though:\n- Almost everything Nils needs on day one runs through Jason\n- The keys, the accounts, and whatever he knows about the routing layer\n- None of it is written down anywhere\n\nNormal at three people. It stops being fine when the new person is used to a wiki — his instinct when he's stuck won't be to ask, it'll be to go and look.",
    question: "How much of the infra side is only in Jason's head?",
    replies: [
      "Most of it. The routing and fallback layer especially — it's never been written down.",
      "All of the interesting parts. He'd have to draw it on a whiteboard.",
      "Honestly, all of it. That's the problem.",
    ],
  },
  {
    ada: "most of it. the routing layer especially — what's actually live vs what's a stub, and why. he'd have to draw it on a whiteboard, which he can't do because nils is in berlin",
    steps: ["Noting that", "Checking the time difference"],
    craig:
      "Berlin — so he's nine hours ahead of Jason.\n\nWhat that actually means:\n- About a two-hour overlap on a good day\n- Jason's starting his morning as Nils finishes his\n- “Just ask Jason” is really that two-hour window\n\nSo anything that only exists in Jason's head has to come out before day one, or Nils spends week one guessing.",
    question: "Is anyone else going to be in Craig with you?",
    replies: [
      "No — just me. Jason would never log into another tool.",
      "Only me for now. I'll pass things on to Jason myself.",
      "Just me. Matty's contract and Jason lives in his terminal.",
    ],
  },
  {
    ada: "just me. jason would never log into another tool and matty's only here two days a week",
    steps: ["Putting a workflow together"],
    craig:
      "Fair enough — plenty of people do it that way, and it's simpler. Everything lands on you, and you pass on what's Jason's.\n\nHere's what I'd build:\n- Contract first — signing it is what gets him an account here\n- Then payroll, right to work, and the laptop, which he ticks off himself\n- Accounts one at a time: Google Workspace first, because everything else is addressed to that email. Then Slack, GitHub, Linear\n- MFA right behind Workspace and behind GitHub — they run in order, so he can't reach Linear without doing both\n- Vanta last: policies, security training, device agent\n\nTwo bits I've left open rather than guessing — which right-to-work check applies in Germany, and which Slack channels he actually needs.\n\nGive me a second and I'll write it.",
    offersWorkflow: true,
  },
];
