import '../styles/globals.css';
import Header from '../components/Header';
import '../styles/product.module.css';


export default function App({ Component, pageProps }) {
  return (
    <>
      <Header />
      <Component {...pageProps} />
    </> 
  );
}
