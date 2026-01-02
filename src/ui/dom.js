export const setText = (id, value) => {
  const element = document.getElementById(id)
  if (element) {
    element.textContent = value ?? ''
  }
}

export const setJson = (id, value) => {
  const element = document.getElementById(id)
  if (element) {
    element.textContent = value ? JSON.stringify(value, null, 2) : ''
  }
}

export const setHidden = (id, hidden) => {
  const element = document.getElementById(id)
  if (element) {
    element.hidden = hidden
  }
}
