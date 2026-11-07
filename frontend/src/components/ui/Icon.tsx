import hintNext from '../../assets/icons/hint-next.svg'
import hintSteps from '../../assets/icons/hint-steps.svg'
import hintCheck from '../../assets/icons/hint-check.svg'
import evidenceDown from '../../assets/icons/evidence-down.svg'
import evidenceUp from '../../assets/icons/evidence-up.svg'
import checkChoice from '../../assets/icons/check-choice.svg'
import check from '../../assets/icons/check.svg'
import chevronUp from '../../assets/icons/chevron-up.svg'
import code from '../../assets/icons/code.svg'
import expand from '../../assets/icons/expand.svg'
import sendActive from '../../assets/icons/send-active.svg'
import collapse from '../../assets/icons/collapse.svg'
import codeChevron from '../../assets/icons/code-chevron.svg'
import lock from '../../assets/icons/lock.svg'
import plusDisabled from '../../assets/icons/plus-disabled.svg'
import chevronDisabled from '../../assets/icons/chevron-disabled.svg'
import retry from '../../assets/icons/retry.svg'
import plusExample from '../../assets/icons/plus-example.svg'
import more from '../../assets/icons/more.svg'
import newChat from '../../assets/icons/new-chat.svg'
import history from '../../assets/icons/history.svg'
import info from '../../assets/icons/info.svg'
import sidebar from '../../assets/icons/sidebar.svg'
import plus from '../../assets/icons/plus.svg'
import chevron from '../../assets/icons/chevron.svg'
import send from '../../assets/icons/send.svg'

const icons = { hintNext, hintSteps, hintCheck, evidenceDown, evidenceUp, checkChoice, more, newChat, history, info, sidebar, plus, chevron, send, check, chevronUp, code, expand, sendActive, collapse, codeChevron, lock, plusDisabled, chevronDisabled, retry, plusExample }
export type IconName = keyof typeof icons
export function Icon({ name }: { name: IconName }) {
  return <img src={icons[name]} alt="" aria-hidden="true" className="block shrink-0" />
}
