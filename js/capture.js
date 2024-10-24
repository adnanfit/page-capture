jQuery(document).ready(function ($) {
  let capturing = false;
  let capturedCanvas = null;

  // Wait for jsPDF to be available
  if (typeof window.jspdf === "undefined") {
    window.jspdf = window.jsPDF;
  }

  // Create a promise-based delay function
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Smooth scroll function
  async function smoothScroll(to) {
    return new Promise(async (resolve) => {
      window.scrollTo({
        top: to,
        behavior: "smooth",
      });
      await delay(500);
      resolve();
    });
  }

  // Function to capture a single viewport
  async function captureViewport() {
    try {
      const canvas = await html2canvas(document.documentElement, {
        useCORS: true,
        allowTaint: true,
        scrollY: -window.pageYOffset,
        windowWidth: document.documentElement.clientWidth,
        windowHeight: window.innerHeight,
        width: document.documentElement.clientWidth,
        height: window.innerHeight,
        scale: 2,
        logging: true,
        removeContainer: true,
        backgroundColor: null,
        onclone: function (clonedDoc) {
          $(clonedDoc)
            .find(
              "#capture-button, #download-popup, #processing-overlay, .capture-button-inline"
            )
            .remove();
        },
      });
      return canvas;
    } catch (error) {
      console.error("Viewport capture error:", error);
      throw error;
    }
  }

  async function startCapture(clickedElement) {
    if (capturing) return;
    capturing = true;

    const $clickedButton = $(clickedElement);
    $clickedButton.addClass("capturing");
    $("#capture-button, .capture-button-inline").prop("disabled", true);

    try {
      const originalScrollPos = window.pageYOffset;

      // Get total height including any overflow
      const totalHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight,
        document.documentElement.getBoundingClientRect().height
      );

      const finalCanvas = document.createElement("canvas");
      const ctx = finalCanvas.getContext("2d");
      finalCanvas.width = document.documentElement.clientWidth * 2;
      finalCanvas.height = totalHeight * 2;

      const viewportHeight = window.innerHeight;
      const totalViewports = Math.ceil(totalHeight / (viewportHeight * 0.95)); // Overlap by 5% to ensure no gaps
      let currentViewport = 0;

      await smoothScroll(0);
      await delay(1000); // Longer initial delay to ensure page is ready

      while (currentViewport < totalViewports) {
        const currentScrollPosition = currentViewport * (viewportHeight * 0.95);
        await smoothScroll(currentScrollPosition);
        await delay(500); // Wait for scroll to settle

        const viewportCanvas = await captureViewport();

        // Calculate the actual position to draw, accounting for overlap
        const drawPosition = currentViewport * viewportHeight * 1.9; // Adjusted for scale factor and overlap

        ctx.drawImage(
          viewportCanvas,
          0,
          drawPosition,
          viewportCanvas.width,
          viewportCanvas.height
        );

        currentViewport++;
      }

      // Capture one more time at the very bottom to ensure we get everything
      await smoothScroll(totalHeight - viewportHeight);
      await delay(500);

      const finalViewportCanvas = await captureViewport();
      ctx.drawImage(
        finalViewportCanvas,
        0,
        (totalViewports - 1) * viewportHeight * 1.9,
        finalViewportCanvas.width,
        finalViewportCanvas.height
      );

      await smoothScroll(originalScrollPos);
      capturedCanvas = finalCanvas;
      showDownloadPopup();
    } catch (error) {
      console.error("Capture failed:", error);
      alert("Failed to capture page. Please try again.");
    } finally {
      $clickedButton.removeClass("capturing");
      $("#capture-button, .capture-button-inline").prop("disabled", false);
      capturing = false;
    }
  }

  // Update captureViewport function for better capture
  async function captureViewport() {
    try {
      const canvas = await html2canvas(document.documentElement, {
        useCORS: true,
        allowTaint: true,
        scrollY: -window.pageYOffset,
        windowWidth: document.documentElement.clientWidth,
        windowHeight: window.innerHeight,
        width: document.documentElement.clientWidth,
        height: window.innerHeight,
        scale: 2,
        logging: true,
        removeContainer: true,
        backgroundColor: null,
        foreignObjectRendering: true,
        imageTimeout: 0,
        onclone: function (clonedDoc) {
          $(clonedDoc)
            .find(
              "#capture-button, #download-popup, #processing-overlay, .capture-button-inline"
            )
            .remove();

          // Ensure fixed elements are properly handled
          $(clonedDoc)
            .find("*")
            .each(function () {
              const position = getComputedStyle(this).position;
              if (position === "fixed") {
                this.style.position = "absolute";
              }
            });
        },
      });
      return canvas;
    } catch (error) {
      console.error("Viewport capture error:", error);
      throw error;
    }
  }

  async function convertToPdf() {
    if (!capturedCanvas) {
      alert("No capture available. Please capture the page first.");
      return;
    }

    showProcessingOverlay();

    try {
      const { jsPDF } = window.jspdf;

      const a4Width = 210;
      const a4Height = 297;

      const imgWidth = capturedCanvas.width / 2;
      const imgHeight = capturedCanvas.height / 2;
      const ratio = imgWidth / imgHeight;

      let width = a4Width - 20;
      let height = width / ratio;

      const pdf = new jsPDF({
        orientation: height > a4Height ? "p" : "l",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      const pages = Math.ceil(height / (a4Height - 20));
      for (let page = 0; page < pages; page++) {
        if (page > 0) {
          pdf.addPage();
        }

        const sliceHeight = Math.min(
          imgHeight - page * (imgHeight / pages),
          imgHeight / pages
        );
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = imgWidth;
        canvas.height = sliceHeight;

        ctx.drawImage(
          capturedCanvas,
          0,
          page * (imgHeight / pages) * 2,
          imgWidth * 2,
          sliceHeight * 2,
          0,
          0,
          imgWidth,
          sliceHeight
        );

        const imgData = canvas.toDataURL("image/jpeg", 1.0);
        pdf.addImage(
          imgData,
          "JPEG",
          10,
          10,
          width,
          (sliceHeight * width) / imgWidth
        );
      }

      pdf.save(document.title + "-capture.pdf");
      hideProcessingOverlay();
    } catch (error) {
      console.error("PDF conversion failed:", error);
      alert("Failed to convert to PDF. Please try again.");
      hideProcessingOverlay();
    }
  }

  function showProcessingOverlay() {
    $(`
        <div id="processing-overlay">
          <div class="processing-content">
            <div class="spinner"></div>
            <p>Converting to PDF...</p>
          </div>
        </div>
      `).appendTo("body");
  }

  function hideProcessingOverlay() {
    $("#processing-overlay").fadeOut(function () {
      $(this).remove();
    });
  }

  function showDownloadPopup() {
    $("#download-popup").remove();

    const popup = $(`
        <div id="download-popup">
          <div class="download-content">
            <h3>Capture Complete!</h3>
            <div class="download-buttons">
              <button id="download-png" class="download-btn">Download as PNG</button>
              <button id="download-pdf" class="download-btn">Download as PDF</button>
            </div>
          </div>
        </div>
      `).appendTo("body");

    $("#download-png").click(function () {
      capturedCanvas.toBlob(
        function (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.download = (document.title || "page-capture") + ".png";
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
          popup.fadeOut(function () {
            $(this).remove();
          });
        },
        "image/png",
        1.0
      );
    });

    $("#download-pdf").click(function () {
      convertToPdf();
      popup.fadeOut(function () {
        $(this).remove();
      });
    });

    popup.click(function (e) {
      if ($(e.target).is("#download-popup")) {
        popup.fadeOut(function () {
          $(this).remove();
        });
      }
    });
  }

  $("#capture-button, .capture-button-inline").click(function () {
    startCapture(this);
  });
});
