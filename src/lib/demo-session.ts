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
 * Craig: a friendly neighbour who happens to be good at this, and pleased to
 * be helping. Warm, a bit enthusiastic, plain sentences, contractions, says
 * "honestly" and "ah". He notices things and mentions them; he doesn't analyse
 * them at you. He reassures — most of what Ada is worried about is normal —
 * without ever pretending a real gap isn't one.
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
      "Ah brilliant, thanks — had a proper read. Genuinely more than enough to work with, don't worry about the state of it.\n\nCouple of things jumped straight out. Your handbook tells the new person to “figure out who owns what — honestly it's just the three of us right now so ask”. That's the bit that'll trip Nils up. It isn't really a step, it's just Jason.\n\nAnd of the four things on your first-week list, three of them land on Jason too — GitHub, the infra tooling, and whoever knows the answer.\n\nThat matters a bit more than usual coming from a 400-person place. He's used to someone handing him a checklist, and here the checklist says “ask”.",
    question:
      "Two quick ones and I'll have plenty. Is Jason still the only one who can hand out GitHub and AWS? And what actually happens if someone pushes to prod in their first week?",
    replies: [
      "yeah jason owns all of it — github, aws, the provider keys. and prod, realistically they'd break routing for someone",
      "all jason. and honestly prod's the scary one, it'd be pretty easy to knock routing over without realising",
      "jason has every key. prod we've broken ourselves before, it's recoverable but not something you want on day 3",
    ],
  },
  {
    ada: "yeah jason owns all of it, github aws the provider keys all of it. i could probably do github at a push but i'd have to ask him where things are which kind of proves your point lol. prod — realistically they'd break routing for someone. we've done it, it's recoverable, but i'd rather they didn't do it on day 3 without knowing what's live and what's fallback",
    steps: [
      "Working out what needs doing before day one",
      "Checking what's stuck behind what",
    ],
    craig:
      "Ah that's really useful, thank you. So you've got two things going on, and the good news is they're not the same problem.\n\nAccess is just a queue. It all goes through Jason, there's no backup, and four later things are sat waiting behind it. That one's easy enough to sort.\n\nProd's the more interesting one. Nothing's actually stopping a new person poking at routing, and the only place “what's safe to touch” lives is in Jason's head.",
    question:
      "One more and then I'll put something together — who's the first person Nils talks to who isn't you or Jason?",
    replies: [
      "...nobody lol. matty i guess but he's part time and remote",
      "honestly no one. matty's around 2 days a week but they'd barely overlap",
      "there isn't one. that's bad isn't it",
    ],
  },
  {
    ada: "...nobody lol. matty i guess but he's part time and remote and i don't think they'd overlap much. that's bad isn't it",
    steps: ["Putting a workflow together"],
    craig:
      "Honestly? Completely normal at three people — I wouldn't lose sleep over it. Worth saying out loud though, especially with Nils nine hours ahead of Jason. “Just ask Jason” is really a two-hour window a day, and someone who won't ask twice will just have a guess instead.\n\nRight — here's what I'd put together. One workflow, engineer, nine steps.\n\nBefore he starts — contract and payroll with you, and get the laptop ordered the day he signs. Two weeks to arrive, so it's really the first thing even though it feels like the last.\n\nGetting him in — GitHub, AWS and the provider keys, all Jason. Slack channels too, except nobody's got that one yet.\n\nDay one — the handbook, but a fresh one. And half an hour with Jason on what's live and what's fallback.\n\nBefore prod — Jason signs it off. Nothing touches routing till he has.\n\nThirty days — you and him, on what should've been written down and wasn't.\n\nTwo bits I've left flagged instead of guessing at them: nobody owns the Slack channel list, and two steps point at that February handbook. They'll show up as unconfigured so you'll spot them before you publish.\n\nHave a look and change whatever you like — it's only a draft, nothing's live until you say so.",
    offersWorkflow: true,
  },
];
