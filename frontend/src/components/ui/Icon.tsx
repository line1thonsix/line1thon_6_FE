import more from '../../assets/icons/more.svg'
import newChat from '../../assets/icons/new-chat.svg'
import history from '../../assets/icons/history.svg'
import info from '../../assets/icons/info.svg'
import sidebar from '../../assets/icons/sidebar.svg'
import plus from '../../assets/icons/plus.svg'
import chevron from '../../assets/icons/chevron.svg'
import send from '../../assets/icons/send.svg'

const icons = { more, newChat, history, info, sidebar, plus, chevron, send }
export type IconName = keyof typeof icons
export function Icon({ name }: { name: IconName }) {
  return <img src={icons[name]} alt="" aria-hidden="true" className="block shrink-0" />
}
